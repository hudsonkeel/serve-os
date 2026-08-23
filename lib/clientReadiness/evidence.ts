// Business orchestration for Client Readiness evidence — mirrors
// lib/emergencyPreparedness/emergencyPreparednessReviews.ts's exact
// discipline: every write goes through createPersonEvidence +
// verifyPersonEvidence (never a parallel compliance engine), and every
// satisfaction_context is validated against this domain's own closed
// vocabulary before it reaches the database.
import { createPersonEvidence, getPersonEvidenceForSubject, verifyPersonEvidence } from "../data/personEvidence.ts";
import { getCurrentResidentTriageClassification } from "../data/residentTriageClassifications.ts";
import { linkEvidenceToRequirement } from "../data/requirementEvidenceLinks.ts";
import { ASSESSMENT_VALIDITY_DAYS, ISP_VALIDITY_DAYS } from "./constants.ts";
import { TRIAGE_LEVEL_LABELS } from "./triageClassification.ts";
import type { ClientReadinessSatisfactionContext } from "./satisfactionContext.ts";
import type { AttestationResult, AuthoritativeSourceSystem, PersonEvidence } from "../supabase/types.ts";

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function createVerifiedResidentEvidence(input: {
  residentId: string;
  requirementId: string;
  documentId: string | null;
  effectiveDate: string;
  expirationDate: string | null;
  satisfactionContext: ClientReadinessSatisfactionContext | null;
  supersedesEvidenceId?: string | null;
  enteredBy: string;
  verifiedBy: string;
  authoritativeSourceSystem?: AuthoritativeSourceSystem | null;
  collectionMethod?: "human_attestation" | "structured_import" | "document_upload" | null;
  verificationMethod?: "direct_source_review" | "document_review" | "imported_authoritative_status" | null;
  externalReference?: string | null;
  notes: string | null;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  // person_evidence_human_attestation_provenance_check (20260817000000)
  // requires authoritative_source_system, verification_method, AND
  // attestation_result to all be non-null whenever collection_method =
  // 'human_attestation' — caught live (this pass): every Client Readiness
  // attestation (guardian-none, medication list, care documentation) sets
  // the first two but was missing the third. Every one of these
  // attestations represents a direct, successful human confirmation (there
  // is no "problem" outcome path here — the domain-specific result lives
  // in satisfaction_context, not this field), so 'verified' is always
  // correct whenever this collection method is used.
  const attestationResult: AttestationResult | null = input.collectionMethod === "human_attestation" ? "verified" : null;

  const created = await createPersonEvidence({
    subjectType: "resident",
    subjectId: input.residentId,
    requirementId: input.requirementId,
    documentId: input.documentId,
    result: null,
    performedAt: input.effectiveDate,
    effectiveDate: input.effectiveDate,
    reviewDueDate: null,
    expirationDate: input.expirationDate,
    enteredBy: input.enteredBy,
    notes: input.notes,
    supersedesEvidenceId: input.supersedesEvidenceId ?? null,
    satisfactionContext: input.satisfactionContext,
    authoritativeSourceSystem: input.authoritativeSourceSystem ?? null,
    collectionMethod: input.collectionMethod ?? null,
    verificationMethod: input.verificationMethod ?? null,
    attestationResult,
    externalReference: input.externalReference ?? null,
  });
  if (created.error || !created.evidence) return { error: created.error };

  const verified = await verifyPersonEvidence({
    evidenceId: created.evidence.id,
    verifiedBy: input.verifiedBy,
    result: null,
    notes: input.notes,
  });
  if (verified.error) return { error: verified.error };

  return { evidence: { ...created.evidence, verification_status: "verified", verified_by: input.verifiedBy } };
}

// ─── Assessment → governed evidence (Serve-native, Phase 3) ──────────────
// Called immediately after approve_assessment_session() succeeds — a
// second, sequential app-layer call, not a change to that RPC's own
// transaction. Idempotent: external_reference carries the assessment
// session id, so a retry (e.g. after a prior evidence-write failure) never
// creates a duplicate — it finds and returns the row already written for
// this exact session instead.
export async function recordAssessmentEvidence(input: {
  residentId: string;
  requirementId: string; // CR_ASSESSMENT_CURRENT's id — resolved by the caller
  assessmentSessionId: string;
  effectiveDate: string; // the assessment's own date (session.finished_at ?? started_at), never approval click time
  assessor: string; // session.started_by
  approvingActor: string;
}): Promise<{ evidence?: PersonEvidence; alreadyRecorded?: boolean; error?: string }> {
  const existing = await getPersonEvidenceForSubject("resident", input.residentId);
  const already = existing.find(
    (e) => e.requirement_id === input.requirementId && e.external_reference === input.assessmentSessionId
  );
  if (already) {
    return { evidence: already, alreadyRecorded: true };
  }

  const priorForRequirement = existing
    .filter((e) => e.requirement_id === input.requirementId && e.lifecycle_status === "active")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  const result = await createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: null,
    effectiveDate: input.effectiveDate,
    expirationDate: addDays(new Date(input.effectiveDate), ASSESSMENT_VALIDITY_DAYS),
    satisfactionContext: "assessment_approved",
    supersedesEvidenceId: priorForRequirement?.id ?? null,
    enteredBy: input.assessor,
    verifiedBy: input.approvingActor,
    collectionMethod: "structured_import",
    externalReference: input.assessmentSessionId,
    notes: `Serve Assessment approved (session ${input.assessmentSessionId}).`,
  });
  if (result.error) return { error: result.error };
  return { evidence: result.evidence, alreadyRecorded: false };
}

// ─── Assessment → ISP composition (Client Readiness evidence-composition
// correction) ───────────────────────────────────────────────────────────
// Serve's signed Assessment/Care Plan IS the operational ISP — its
// daily_life (task list), when (frequency/duration/schedule), mobility_
// safety (equipment), and what_why.primary_goals fields are the service
// plan's actual content (confirmed against lib/assessmentIntelligence/
// domainRegistry.ts's own field registry, not inferred from a filename).
// Same composition pattern already proven for Service Agreement ->
// Billing (recordServiceAgreementEvidenceAction in lib/actions/
// clientReadiness.ts): a second, independent person_evidence row — own
// requirement_id (so the standard evaluator reads it directly, no engine
// change needed), same session reference — plus a
// requirement_evidence_links row back to the original Assessment evidence
// for audit traceability. Never a duplicate assessment/upload. Idempotent
// the same way recordAssessmentEvidence() is: dedupes on (requirementId,
// assessmentSessionId).
export async function recordAssessmentIspEvidence(input: {
  residentId: string;
  requirementId: string; // CR_ISP_ON_FILE_AND_CURRENT's id — resolved by the caller
  assessmentEvidenceId: string; // the CR_ASSESSMENT_CURRENT evidence row this composes from
  assessmentSessionId: string;
  effectiveDate: string; // same as the Assessment evidence's own effective date
  assessor: string;
  approvingActor: string;
}): Promise<{ evidence?: PersonEvidence; alreadyRecorded?: boolean; error?: string }> {
  const existing = await getPersonEvidenceForSubject("resident", input.residentId);
  const already = existing.find(
    (e) => e.requirement_id === input.requirementId && e.external_reference === input.assessmentSessionId
  );
  if (already) {
    return { evidence: already, alreadyRecorded: true };
  }

  const priorForRequirement = existing
    .filter((e) => e.requirement_id === input.requirementId && e.lifecycle_status === "active")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  const result = await createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: null,
    effectiveDate: input.effectiveDate,
    expirationDate: addDays(new Date(input.effectiveDate), ISP_VALIDITY_DAYS),
    satisfactionContext: "isp_satisfied_by_assessment",
    supersedesEvidenceId: priorForRequirement?.id ?? null,
    enteredBy: input.assessor,
    verifiedBy: input.approvingActor,
    collectionMethod: "structured_import",
    externalReference: input.assessmentSessionId,
    notes: `ISP satisfied by the approved Serve Assessment/Care Plan (session ${input.assessmentSessionId}) — the same session's daily_life/when/mobility_safety/goals content is the service plan.`,
  });
  if (result.error || !result.evidence) return { error: result.error };

  await linkEvidenceToRequirement({
    requirementId: input.requirementId,
    evidenceId: input.assessmentEvidenceId,
    rationale: "The approved Assessment/Care Plan session is also the operational ISP — one artifact, two governed requirements.",
    linkedBy: input.approvingActor,
  });

  return { evidence: result.evidence, alreadyRecorded: false };
}

// ─── Assessment / Care Plan (manual document upload) → ISP composition ───
// The generic, requirement-agnostic manual-upload path
// (recordClientReadinessDocumentEvidenceAction in lib/actions/
// clientReadiness.ts) is the real, predominant way CR_ASSESSMENT_CURRENT
// evidence gets accepted in this deployment — not only the structured
// assessment-intelligence pipeline recordAssessmentIspEvidence() above
// composes from. Same rule, same composition principle, different
// artifact reference: here the shared governed artifact is the uploaded
// document itself (documentId), not an assessment session id. One
// document, two independent person_evidence rows (own requirement_id
// each, so the standard evaluator reads both directly), linked via
// requirement_evidence_links for traceability. Never a second upload. A
// re-upload of a newer Assessment/Care Plan correctly supersedes the
// prior ISP evidence too (via supersedesEvidenceId), the same way it
// already supersedes the prior Assessment evidence — this is a real new
// artifact, not a retry, so supersession (not the session-based
// function's dedup-by-key) is the correct idempotency shape here.
export async function recordAssessmentIspEvidenceFromDocument(input: {
  residentId: string;
  requirementId: string; // CR_ISP_ON_FILE_AND_CURRENT's id
  assessmentEvidenceId: string; // the CR_ASSESSMENT_CURRENT evidence row this composes from
  documentId: string; // the same uploaded document — never re-uploaded
  effectiveDate: string;
  expirationDate: string | null;
  supersedesEvidenceId: string | null;
  actor: string;
  notes: string | null;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  const result = await createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: input.documentId,
    effectiveDate: input.effectiveDate,
    expirationDate: input.expirationDate,
    satisfactionContext: "isp_satisfied_by_assessment",
    supersedesEvidenceId: input.supersedesEvidenceId,
    enteredBy: input.actor,
    verifiedBy: input.actor,
    collectionMethod: "document_upload",
    verificationMethod: "document_review",
    notes: input.notes ?? "ISP satisfied by the same Assessment/Care Plan document.",
  });
  if (result.error || !result.evidence) return { error: result.error };

  await linkEvidenceToRequirement({
    requirementId: input.requirementId,
    evidenceId: input.assessmentEvidenceId,
    rationale: "The uploaded Assessment/Care Plan document is also the operational ISP — one artifact, two governed requirements.",
    linkedBy: input.actor,
  });

  return { evidence: result.evidence };
}

// ─── Emergency Triage Classification — AxisCare-sourced governed evidence ──
// Leadership confirmed (2026-08-17) that AxisCare's Client Profile Triage
// Level field IS the same triage classification EP_CLIENT_TRIAGE_CLASSIFIED
// (Serve P&P §256, item 4) requires — never a coincidentally-named
// different concept. This writes a governed person_evidence row exactly
// like every other bootstrap fact; the deterministic evaluator
// (evaluateRequirementSetStatus) is never called live against AxisCare —
// it only ever reads back the evidence this function already wrote.
//
// Ownership rule: once ANY active evidence exists for this resident's
// EP_CLIENT_TRIAGE_CLASSIFIED requirement — however it got there, AxisCare
// bootstrap or a future Serve-native triage review — AxisCare must never
// silently supersede it. This checks for existing active evidence FIRST,
// unconditionally, before ever writing (a stricter idempotency rule than
// recordAssessmentEvidence()'s per-session dedup, because triage has no
// natural "session" boundary — the fact itself, not a particular sourcing
// event, is what Serve owns once recorded).
export async function recordAxisCareTriageEvidence(input: {
  residentId: string;
  requirementId: string; // EP_CLIENT_TRIAGE_CLASSIFIED's id
  axiscareClientId: string;
  triageLevelId: string;
  triageLevelDescription: string | null;
  fetchedAt: string; // ISO date/datetime the AxisCare snapshot was fetched
  actor: string;
}): Promise<{ evidence?: PersonEvidence; alreadyOwnedByServe?: boolean; error?: string }> {
  const existing = await getPersonEvidenceForSubject("resident", input.residentId);
  const alreadyOwned = existing.find((e) => e.requirement_id === input.requirementId && e.lifecycle_status === "active");
  if (alreadyOwned) {
    return { evidence: alreadyOwned, alreadyOwnedByServe: true };
  }

  const result = await createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: null,
    effectiveDate: input.fetchedAt.slice(0, 10),
    expirationDate: null, // AxisCare's triageLevel carries no cadence of its own — non-expiring until Serve reviews/replaces it
    satisfactionContext: "triage_classification_axiscare_sourced",
    enteredBy: input.actor,
    verifiedBy: input.actor,
    authoritativeSourceSystem: "axiscare",
    collectionMethod: "structured_import",
    verificationMethod: "imported_authoritative_status",
    externalReference: input.axiscareClientId,
    notes: `AxisCare Triage Level: ${input.triageLevelDescription ?? input.triageLevelId} (AxisCare client ${input.axiscareClientId}, fetched ${input.fetchedAt}).`,
  });
  if (result.error) return { error: result.error };
  return { evidence: result.evidence, alreadyOwnedByServe: false };
}

// ─── Emergency Triage Classification — Serve-recorded governed evidence ───
// Companion to recordAxisCareTriageEvidence above, for the new structured
// Serve-native recording path (resident_triage_classifications). Two
// deliberate differences from that function:
//
//   1. It is driven by the RESOLVED CURRENT classification
//      (getCurrentResidentTriageClassification — effective_date <= today,
//      never a future-dated row), not by "whatever row was just inserted."
//      Recording a future-dated classification ahead of time must not
//      flip evidence (or the requirement's satisfaction) early.
//
//   2. Unlike recordAxisCareTriageEvidence's block-if-any-evidence-exists
//      rule, this ALWAYS supersedes prior active evidence for the
//      requirement when the current classification has changed — a fresh
//      Serve recording is a genuine update event, not a bootstrap that
//      must defer to whatever Serve already owns. This does not weaken
//      the existing rule that AxisCare's own sync must never silently
//      supersede Serve: that rule is untouched, lives entirely in
//      recordAxisCareTriageEvidence's own existing-evidence check, and
//      still applies against whatever this function writes.
//
// IMPORTANT: this requirement's actual satisfaction is read directly from
// resident_triage_classifications (evaluateTriageClassification() in
// clientReadinessReadiness.ts), never from this evidence row's mere
// existence. This function is best-effort, for the audit trail and for
// evidenceSummary display only — if it fails after the governed
// classification row was already committed, the requirement is still
// correctly satisfied; recomputing from "current" each call also makes a
// later retry self-healing rather than needing special repair logic.
export async function syncCurrentTriageClassificationEvidence(input: {
  residentId: string;
  requirementId: string; // EP_CLIENT_TRIAGE_CLASSIFIED's id
  actor: string;
}): Promise<{ evidence?: PersonEvidence; skipped?: "no_current_classification" | "already_current"; error?: string }> {
  const current = await getCurrentResidentTriageClassification(input.residentId);
  if (!current) {
    return { skipped: "no_current_classification" };
  }

  const existing = await getPersonEvidenceForSubject("resident", input.residentId);
  const priorActive = existing
    .filter((e) => e.requirement_id === input.requirementId && e.lifecycle_status === "active")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  if (priorActive?.external_reference === current.id) {
    return { evidence: priorActive, skipped: "already_current" };
  }

  const result = await createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: null,
    effectiveDate: current.effectiveDate,
    expirationDate: null, // no cadence of its own — non-expiring until superseded by a later recording
    satisfactionContext: "triage_classification_serve_recorded",
    supersedesEvidenceId: priorActive?.id ?? null,
    enteredBy: current.actor,
    verifiedBy: current.actor,
    authoritativeSourceSystem: "other_authorized_source",
    collectionMethod: "human_attestation",
    verificationMethod: "direct_source_review",
    externalReference: current.id,
    notes: `${TRIAGE_LEVEL_LABELS[current.levelCode]}${current.notes ? ` — ${current.notes}` : ""}`,
  });
  if (result.error) return { error: result.error };
  return { evidence: result.evidence };
}

// ─── Client Profile — guardian applicability attestation ─────────────────
// "No legal guardian" is a recorded fact, never inferred from blank
// physician/guardian fields — see CR_CLIENT_PROFILE_ON_FILE's bespoke
// composition in clientReadinessReadiness.ts, which reads this evidence
// alongside the resident's own guardian_name/guardian_phone columns.
export async function recordGuardianNoneAttestation(input: {
  residentId: string;
  requirementId: string; // CR_CLIENT_PROFILE_ON_FILE's id
  actor: string;
  notes: string | null;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  return createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: null,
    effectiveDate: new Date().toISOString().slice(0, 10),
    expirationDate: null,
    satisfactionContext: "guardian_confirmed_none",
    enteredBy: input.actor,
    verifiedBy: input.actor,
    // No physician/AxisCare/etc. system holds "this client has no legal
    // guardian" — it's a direct staff confirmation with no external record,
    // so this is the same catch-all workforce human attestations already
    // use for that case (lib/workforce/humanAttestation.ts). Required
    // non-null by person_evidence_human_attestation_provenance_check
    // whenever collection_method = 'human_attestation'.
    authoritativeSourceSystem: "other_authorized_source",
    collectionMethod: "human_attestation",
    verificationMethod: "direct_source_review",
    notes: input.notes ?? "Confirmed no legal guardian.",
  });
}

// ─── Medication List Available — Verify From Source (physical folder) ────
export async function recordMedicationListAttestation(input: {
  residentId: string;
  requirementId: string; // CR_MEDICATION_LIST_ON_FILE's id
  outcome: "present" | "not_applicable";
  actor: string;
  notes: string | null;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  const satisfactionContext: ClientReadinessSatisfactionContext =
    input.outcome === "present" ? "medication_list_verified_present" : "medication_list_verified_not_applicable";

  return createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: null,
    effectiveDate: new Date().toISOString().slice(0, 10),
    expirationDate: null, // no invented cadence — non-expiring until re-attested
    satisfactionContext,
    enteredBy: input.actor,
    verifiedBy: input.actor,
    authoritativeSourceSystem: "physical_client_folder",
    collectionMethod: "human_attestation",
    verificationMethod: "direct_source_review",
    notes: input.notes,
  });
}

// ─── Care / Service Documentation — Verify From Source (AxisCare) ────────
export async function recordCareDocumentationAttestation(input: {
  residentId: string;
  requirementId: string; // CR_CARE_DOCUMENTATION_CURRENT's id
  verifiedThroughDate: string;
  actor: string;
  notes: string | null;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  return createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: null,
    effectiveDate: input.verifiedThroughDate,
    expirationDate: null, // no invented cadence — non-expiring until re-attested
    satisfactionContext: "care_documentation_verified",
    enteredBy: input.actor,
    verifiedBy: input.actor,
    authoritativeSourceSystem: "axiscare",
    collectionMethod: "human_attestation",
    verificationMethod: "direct_source_review",
    notes: input.notes,
  });
}

// ─── Generic document-backed requirements (ISP, Service Agreement,
// Supervisory Visit, Significant Events, Discharge) ────────────────────────
export async function recordDocumentEvidence(input: {
  residentId: string;
  requirementId: string;
  documentId: string;
  effectiveDate: string;
  expirationDate: string | null;
  supersedesEvidenceId?: string | null;
  actor: string;
  notes: string | null;
}): Promise<{ evidence?: PersonEvidence; error?: string }> {
  return createVerifiedResidentEvidence({
    residentId: input.residentId,
    requirementId: input.requirementId,
    documentId: input.documentId,
    effectiveDate: input.effectiveDate,
    expirationDate: input.expirationDate,
    satisfactionContext: null,
    supersedesEvidenceId: input.supersedesEvidenceId,
    enteredBy: input.actor,
    verifiedBy: input.actor,
    collectionMethod: "document_upload",
    verificationMethod: "document_review",
    notes: input.notes,
  });
}
