// Data layer for the platform-owned, polymorphic evidence table — the
// shared record Workforce Intelligence and the future Background
// Eligibility engine will both read. See
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql.
//
// Two distinct mutation regimes, matching the DB's own enforcement:
//   - while verification_status = 'unverified': free in-place editing
//     (updateUnverifiedPersonEvidence, reassignUnverifiedPersonEvidenceSubject,
//     deleteUnverifiedPersonEvidence) — the DB's check_verified_evidence_immutable
//     trigger doesn't apply yet, so these are plain updates/RPC calls.
//   - once verified or rejected: historically immutable except for the
//     lifecycle_status trio (markPersonEvidenceSuperseded,
//     markPersonEvidenceEnteredInError, markPersonEvidenceExpired) — the DB
//     trigger is the real guarantee; these functions exist to set exactly
//     the columns it permits.
import { createServerClient } from "../supabase/server.ts";
import { buildLifecycleTransitionPatch } from "../workforce/evidenceLifecycle.ts";
import type {
  AttestationResult,
  AuthoritativeSourceSystem,
  EvidenceCollectionMethod,
  EvidenceVerificationMethod,
  PersonEvidence,
  PersonEvidenceLifecycleStatus,
  PersonEvidenceResult,
  PersonSubjectType,
} from "../supabase/types.ts";

export async function getPersonEvidenceForSubject(
  subjectType: PersonSubjectType,
  subjectId: string
): Promise<PersonEvidence[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_evidence")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getPersonEvidenceForSubject]", { subjectType, subjectId, message: error.message });
    return [];
  }

  return (data as PersonEvidence[] | null) ?? [];
}

export async function getPersonEvidenceById(id: string): Promise<PersonEvidence | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("person_evidence").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[getPersonEvidenceById]", { id, message: error.message });
    return null;
  }

  return (data as PersonEvidence | null) ?? null;
}

// Whether any other evidence row supersedes this one — "has this evidence
// already been relied upon as history," the same question
// delete_unverified_evidence_and_document() asks at the DB level. Exposed
// separately so the UI/actions layer can pre-check before offering delete.
export async function hasSupersedingEvidence(evidenceId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from("person_evidence")
    .select("id", { count: "exact", head: true })
    .eq("supersedes_evidence_id", evidenceId);

  if (error) {
    console.error("[hasSupersedingEvidence]", { evidenceId, message: error.message });
    return true; // fail closed — never claim "safe to delete" on an error
  }
  return (count ?? 0) > 0;
}

// Creates a new, unverified evidence record — never treated as verified
// proof on its own; only verifyPersonEvidence() below can change that.
// Protected by the check_subject and check_document_subject triggers.
export async function createPersonEvidence(input: {
  subjectType: PersonSubjectType;
  subjectId: string;
  requirementId: string;
  documentId: string | null;
  result: PersonEvidenceResult | null;
  performedAt: string | null;
  effectiveDate: string | null;
  reviewDueDate: string | null;
  expirationDate: string | null;
  enteredBy: string;
  notes: string | null;
  // Set when this row replaces a mistaken/corrected one — the caller is
  // responsible for separately calling markPersonEvidenceSuperseded() on
  // that prior row (kept as two explicit steps for the same low-
  // concurrency-admin-action reason documented in personDocuments.ts).
  supersedesEvidenceId?: string | null;
  // Human Attestation & Evidence Assurance — see
  // supabase/migrations/20260817000000_add_human_attestation.sql. All
  // optional/null for every pre-existing caller (document upload,
  // supersession); populated together only by submitHumanAttestation().
  authoritativeSourceSystem?: AuthoritativeSourceSystem | null;
  collectionMethod?: EvidenceCollectionMethod | null;
  verificationMethod?: EvidenceVerificationMethod | null;
  attestationResult?: AttestationResult | null;
  externalReference?: string | null;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_evidence")
    .insert({
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      requirement_id: input.requirementId,
      document_id: input.documentId,
      result: input.result,
      performed_at: input.performedAt,
      effective_date: input.effectiveDate,
      review_due_date: input.reviewDueDate,
      expiration_date: input.expirationDate,
      entered_by: input.enteredBy,
      notes: input.notes,
      supersedes_evidence_id: input.supersedesEvidenceId ?? null,
      authoritative_source_system: input.authoritativeSourceSystem ?? null,
      collection_method: input.collectionMethod ?? null,
      verification_method: input.verificationMethod ?? null,
      attestation_result: input.attestationResult ?? null,
      external_reference: input.externalReference ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not create evidence: ${error?.message}` };
  }

  return { evidence: data as PersonEvidence };
}

// The ONLY way verification_status ever becomes 'verified' — always
// requires a named actor, matching the DB's own bidirectional check
// constraint. A filename is never proof of a result; this is the explicit
// human act that makes evidence usable. Only reaches an 'unverified' row —
// the DB's immutability trigger keys off the OLD status, so this update is
// never itself blocked, but is scoped here anyway as a friendlier failure
// mode than a raised exception.
export async function verifyPersonEvidence(input: {
  evidenceId: string;
  verifiedBy: string;
  // Null for Human Attestation — the old registry-search vocabulary
  // (no_record_returned/listed_with_findings/etc.) doesn't apply; the
  // observed outcome lives in attestation_result instead, already set at
  // creation time.
  result: PersonEvidenceResult | null;
  notes: string | null;
  // Employee Record Audit — only meaningful for a score-gated requirement
  // (e.g. HIPAA/HB300, Infection Control training); null for every other
  // requirement. See lib/compliance/requirementSetStatus.ts's
  // meetsScoreThreshold().
  numericScore?: number | null;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error, count } = await supabase
    .from("person_evidence")
    .update(
      {
        verification_status: "verified",
        verified_by: input.verifiedBy,
        verified_at: new Date().toISOString(),
        result: input.result,
        notes: input.notes,
        numeric_score: input.numericScore ?? null,
      },
      { count: "exact" }
    )
    .eq("id", input.evidenceId)
    .eq("verification_status", "unverified");

  if (error) {
    return { error: `Could not verify evidence: ${error.message}` };
  }
  if (!count) {
    return { error: "This evidence is no longer unverified — it may have already been reviewed." };
  }
  return {};
}

export async function rejectPersonEvidence(input: {
  evidenceId: string;
  rejectedBy: string;
  notes: string;
  // Human Attestation & Evidence Assurance — normally left unset (the
  // original reject flow deliberately never credits a specific reviewer on
  // a rejected row). A Human Attestation whose observed result did not
  // satisfy the requirement (e.g. Pending, Contradictory) sets both, so who
  // reviewed the authoritative source and when survives regardless of
  // outcome. Permitted by person_evidence_verification_fields_check, which
  // was loosened (never tightened) for exactly this — see
  // supabase/migrations/20260817000000_add_human_attestation.sql.
  verifiedBy?: string;
  verifiedAt?: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const patch: Record<string, unknown> = {
    verification_status: "rejected",
    notes: input.notes,
  };
  if (input.verifiedBy && input.verifiedAt) {
    patch.verified_by = input.verifiedBy;
    patch.verified_at = input.verifiedAt;
  }

  const { error, count } = await supabase
    .from("person_evidence")
    .update(patch, { count: "exact" })
    .eq("id", input.evidenceId)
    .eq("verification_status", "unverified");

  if (error) {
    return { error: `Could not reject evidence: ${error.message}` };
  }
  if (!count) {
    return { error: "This evidence is no longer unverified — it may have already been reviewed." };
  }
  return {};
}

// ─── Unverified free-edit / reassign / delete ─────────────────────────────
// All three are scoped to verification_status = 'unverified' in the query
// itself, so a race against a concurrent verification fails safely (zero
// rows affected -> friendly error) rather than relying solely on the DB
// trigger's exception.

export async function updateUnverifiedPersonEvidence(input: {
  evidenceId: string;
  requirementId?: string;
  result?: PersonEvidenceResult | null;
  performedAt?: string | null;
  effectiveDate?: string | null;
  reviewDueDate?: string | null;
  expirationDate?: string | null;
  notes?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const patch: Record<string, unknown> = {};
  if (input.requirementId !== undefined) patch.requirement_id = input.requirementId;
  if (input.result !== undefined) patch.result = input.result;
  if (input.performedAt !== undefined) patch.performed_at = input.performedAt;
  if (input.effectiveDate !== undefined) patch.effective_date = input.effectiveDate;
  if (input.reviewDueDate !== undefined) patch.review_due_date = input.reviewDueDate;
  if (input.expirationDate !== undefined) patch.expiration_date = input.expirationDate;
  if (input.notes !== undefined) patch.notes = input.notes;

  if (Object.keys(patch).length === 0) return {};

  const { error, count } = await supabase
    .from("person_evidence")
    .update(patch, { count: "exact" })
    .eq("id", input.evidenceId)
    .eq("verification_status", "unverified");

  if (error) {
    return { error: `Could not update evidence: ${error.message}` };
  }
  if (!count) {
    return { error: "This evidence is no longer unverified and can no longer be edited in place." };
  }
  return {};
}

// Atomic — see reassign_unverified_evidence_subject() in the migration.
// Updates the document's subject first, then the evidence's, inside one
// transaction, so the two never observably disagree.
export async function reassignUnverifiedPersonEvidenceSubject(input: {
  evidenceId: string;
  newSubjectId: string;
  actor: string;
  rationale: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("reassign_unverified_evidence_subject", {
    p_evidence_id: input.evidenceId,
    p_new_subject_id: input.newSubjectId,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });

  if (error) {
    return { error: `Could not reassign evidence: ${error.message}` };
  }
  return {};
}

// Hard delete — see delete_unverified_evidence_and_document() in the
// migration. Only ever succeeds for an unverified record nothing else has
// superseded. Does not touch Supabase Storage; the caller reads
// storage_path (via getPersonDocumentById) before calling this, then
// removes the file afterward.
export async function deleteUnverifiedPersonEvidence(input: {
  evidenceId: string;
  actor: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("delete_unverified_evidence_and_document", {
    p_evidence_id: input.evidenceId,
    p_actor: input.actor,
  });

  if (error) {
    return { error: `Could not delete evidence: ${error.message}` };
  }
  return {};
}

// ─── Protected lifecycle transitions (verified/rejected evidence) ────────
// All three set only the lifecycle_status trio — verification_status,
// verified_by, and verified_at are deliberately left untouched, so a
// verified-then-corrected record permanently preserves who verified it and
// when. Each requires a named actor and a non-blank reason, matching the
// DB's own bidirectional check constraint
// (person_evidence_lifecycle_status_fields_check) — enforced here as a
// friendly pre-check, and by the DB regardless.

async function transitionLifecycleStatus(input: {
  evidenceId: string;
  lifecycleStatus: PersonEvidenceLifecycleStatus;
  actor: string;
  reason: string;
  requireCurrentlyActive: boolean;
}): Promise<{ error?: string }> {
  if (!input.actor || input.actor.trim().length === 0) {
    return { error: "An authenticated actor is required." };
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { error: "A reason is required." };
  }

  const supabase = createServerClient();
  const patch = buildLifecycleTransitionPatch(input.lifecycleStatus, input.actor, input.reason);
  let query = supabase
    .from("person_evidence")
    .update(patch, { count: "exact" })
    .eq("id", input.evidenceId);

  if (input.requireCurrentlyActive) {
    query = query.eq("lifecycle_status", "active");
  }

  const { error, count } = await query;

  if (error) {
    return { error: `Could not update evidence: ${error.message}` };
  }
  if (!count) {
    return { error: "This evidence is no longer active and can no longer transition." };
  }
  return {};
}

// Marks the prior evidence row superseded — does not create the
// replacement itself; call createPersonEvidence() for that (with its own
// document_id) and pass the new row's id nowhere back to the old one, since
// supersedes_evidence_id points from new -> old, not old -> new.
export async function markPersonEvidenceSuperseded(input: {
  evidenceId: string;
  actor: string;
  reason: string;
}): Promise<{ error?: string }> {
  return transitionLifecycleStatus({
    evidenceId: input.evidenceId,
    lifecycleStatus: "superseded",
    actor: input.actor,
    reason: input.reason,
    requireCurrentlyActive: true,
  });
}

// A record that should never have existed for this subject/requirement
// (wrong caregiver, wrong requirement, duplicate entry) — distinct from
// superseded (correct-at-the-time, replaced by newer evidence). Only
// offered for a settled (verified/rejected), still-current record — see
// lib/workforce/evidenceLifecycle.ts's canMarkEnteredInError().
export async function markPersonEvidenceEnteredInError(input: {
  evidenceId: string;
  actor: string;
  reason: string;
}): Promise<{ error?: string }> {
  return transitionLifecycleStatus({
    evidenceId: input.evidenceId,
    lifecycleStatus: "entered_in_error",
    actor: input.actor,
    reason: input.reason,
    requireCurrentlyActive: true,
  });
}

// Marks evidence expired — same discipline as the other lifecycle
// transitions above. No caller in this codebase invokes this yet (there is
// no scheduled-job infrastructure); lib/compliance/requirementSetStatus.ts
// instead treats a past expiration_date as effectively expired at
// evaluation time regardless of this column. This function exists for a
// future scheduled job or an explicit admin action to call.
export async function markPersonEvidenceExpired(input: {
  evidenceId: string;
  actor: string;
  reason: string;
}): Promise<{ error?: string }> {
  return transitionLifecycleStatus({
    evidenceId: input.evidenceId,
    lifecycleStatus: "expired",
    actor: input.actor,
    reason: input.reason,
    requireCurrentlyActive: true,
  });
}
