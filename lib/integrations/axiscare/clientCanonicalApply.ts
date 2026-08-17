// AxisCare -> Serve canonical bootstrap: the APPLY half. The only code
// in this bootstrap ever allowed to write into residents' own canonical
// columns — and only the fields the live discovery pass (revised
// 2026-08-17, leadership-confirmed) found safe, deterministic, and
// structural: date_of_birth, gender, date_of_admission, address/city/
// state/zip_code, and family_contact_name/relationship/phone/email
// (sourced from AxisCare Responsible Parties — the current operational
// source for Serve's family/emergency contact, per leadership).
//
// STILL never touches legal_guardian_*/physician_* — see
// axiscare_client_canonical_snapshot's migration header for why: no
// Responsible Party field in this account establishes legal/medical
// decision-making authority (canMakeMedicalDecisions/
// hipaaDisclosureAuthorization are empty on every sampled party — a
// "Responsible Party" is not evidence of legal guardianship on its own),
// and AxisCare's Physician-class Contacts have zero client linkage
// today (a data gap, not a capability gap — see clientCanonicalSync.ts).
//
// Triage (EP_CLIENT_TRIAGE_CLASSIFIED) is handled by a SEPARATE function
// below, applyAxisCareTriageEvidenceToResident() — it's an evidence fact
// (a person_evidence row), not a residents column, so it doesn't go
// through decideFieldReconciliation()'s column-comparison logic at all;
// see recordAxisCareTriageEvidence() (lib/clientReadiness/evidence.ts)
// for its own, evidence-existence-based ownership rule.
//
// One non-negotiable rule for the residents-column fields below,
// enforced entirely by decideFieldReconciliation()
// (lib/integrations/axiscare/clientCanonicalReconciliation.ts): AxisCare
// may only ever fill a field Serve has never populated. A field Serve
// already owns — however it got there — is never silently overwritten;
// a disagreement is recorded as a conflict for a human to resolve, never
// auto-resolved either direction.
import "server-only";
import { createServerClient } from "../../supabase/server.ts";
import { decideFieldReconciliation, type CanonicalizationOutcome } from "./clientCanonicalReconciliation.ts";
import {
  getAxisCareClientCanonicalSnapshot,
  recordSnapshotCanonicalizationResult,
  recordSnapshotTriageEvidenceResult,
  type CanonicalizationStatus,
} from "../../data/axiscareClientCanonicalSnapshot.ts";
import { recordAxisCareTriageEvidence } from "../../clientReadiness/evidence.ts";
// Type-only — erased at build/strip time, so this never pulls
// residentServeRelationships.ts's live-AxisCare-fetching import chain
// into this file's module graph. See applyAxisCareTriageEvidenceToResident()'s
// own comment for why currentRelationship is a required parameter
// instead of being resolved here.
import type { ServeRelationship } from "../../residents/serveRelationshipProjection.ts";

interface ResidentBootstrapFields {
  date_of_birth: string | null;
  gender: string | null;
  date_of_admission: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  family_contact_name: string | null;
  family_contact_relationship: string | null;
  family_contact_phone: string | null;
  family_contact_email: string | null;
}

const BOOTSTRAP_FIELD_NAMES = [
  "date_of_birth",
  "gender",
  "date_of_admission",
  "address",
  "city",
  "state",
  "zip_code",
  "family_contact_name",
  "family_contact_relationship",
  "family_contact_phone",
  "family_contact_email",
] as const;

export interface ApplyResult {
  residentId: string;
  axiscareClientId: string;
  fieldOutcomes: Record<string, CanonicalizationOutcome>;
  fieldsApplied: string[];
  overallStatus: CanonicalizationStatus;
  error?: string;
}

// Snapshot's street_address_1/2 collapse into residents' single `address`
// text column (Serve models one address line, not AxisCare's two) —
// street_address_2 is folded in only when street_address_1 is also
// present, never surfaced alone.
function combinedAddress(street1: string | null, street2: string | null): string | null {
  if (!street1) return null;
  return street2 ? `${street1}, ${street2}` : street1;
}

export async function applyAxisCareCanonicalSnapshotToResident(
  residentId: string,
  axiscareClientId: string,
  appliedBy: string
): Promise<ApplyResult> {
  const supabase = createServerClient();

  const snapshot = await getAxisCareClientCanonicalSnapshot(axiscareClientId);
  if (!snapshot) {
    return {
      residentId,
      axiscareClientId,
      fieldOutcomes: {},
      fieldsApplied: [],
      overallStatus: "not_reviewed",
      error: "No AxisCare canonical snapshot found — run the sync step first.",
    };
  }

  const { data: residentRow, error: residentError } = await supabase
    .from("residents")
    .select(
      "date_of_birth, gender, date_of_admission, address, city, state, zip_code, family_contact_name, family_contact_relationship, family_contact_phone, family_contact_email"
    )
    .eq("id", residentId)
    .maybeSingle();

  if (residentError || !residentRow) {
    return {
      residentId,
      axiscareClientId,
      fieldOutcomes: {},
      fieldsApplied: [],
      overallStatus: "not_reviewed",
      error: residentError?.message ?? "Resident not found.",
    };
  }

  const resident = residentRow as ResidentBootstrapFields;
  const axiscareValues: ResidentBootstrapFields = {
    date_of_birth: snapshot.date_of_birth,
    gender: snapshot.gender,
    date_of_admission: snapshot.admission_date,
    address: combinedAddress(snapshot.street_address_1, snapshot.street_address_2),
    city: snapshot.city,
    state: snapshot.state,
    zip_code: snapshot.postal_code,
    family_contact_name: snapshot.responsible_party_name,
    family_contact_relationship: snapshot.responsible_party_relationship,
    family_contact_phone: snapshot.responsible_party_phone,
    family_contact_email: snapshot.responsible_party_email,
  };

  const fieldOutcomes: Record<string, CanonicalizationOutcome> = {};
  const updatePayload: Partial<ResidentBootstrapFields> = {};

  for (const field of BOOTSTRAP_FIELD_NAMES) {
    const outcome = decideFieldReconciliation(resident[field], axiscareValues[field]);
    fieldOutcomes[field] = outcome;
    if (outcome === "apply") {
      updatePayload[field] = axiscareValues[field];
    }
  }

  const fieldsApplied = Object.keys(updatePayload);

  if (fieldsApplied.length > 0) {
    const { error: updateError } = await supabase.from("residents").update(updatePayload).eq("id", residentId);
    if (updateError) {
      return {
        residentId,
        axiscareClientId,
        fieldOutcomes,
        fieldsApplied: [],
        overallStatus: "not_reviewed",
        error: `Could not apply bootstrap fields: ${updateError.message}`,
      };
    }
  }

  const outcomes = Object.values(fieldOutcomes);
  const overallStatus: CanonicalizationStatus = outcomes.includes("conflict_unresolved")
    ? "conflict_unresolved"
    : fieldsApplied.length > 0
      ? "applied_to_serve"
      : outcomes.includes("skipped_serve_already_owns")
        ? "skipped_serve_already_owns"
        : "not_reviewed";

  const conflictFields = Object.entries(fieldOutcomes)
    .filter(([, outcome]) => outcome === "conflict_unresolved")
    .map(([field]) => field);

  await recordSnapshotCanonicalizationResult(snapshot.id, {
    status: overallStatus,
    conflictStatus: conflictFields.length > 0 ? "value_disagrees_with_serve" : null,
    conflictNotes: conflictFields.length > 0 ? `Serve and AxisCare disagree on: ${conflictFields.join(", ")}. Never auto-resolved — requires human review.` : null,
    appliedBy: fieldsApplied.length > 0 ? appliedBy : null,
  });

  return { residentId, axiscareClientId, fieldOutcomes, fieldsApplied, overallStatus };
}

export interface TriageApplyResult {
  residentId: string;
  axiscareClientId: string;
  status: "evidence_created" | "skipped_serve_already_owns" | "skipped_no_source_value" | "skipped_not_active_client";
  evidenceId?: string;
  error?: string;
}

// Triage's own apply step — deliberately separate from the residents-
// column loop above, since EP_CLIENT_TRIAGE_CLASSIFIED is an evidence
// fact, not a residents column. Ownership is decided entirely by
// recordAxisCareTriageEvidence()'s own existing-evidence check; this
// function only resolves the requirement id and snapshot, then defers to
// it.
//
// Scoped to active clients only (2026-08-17 leadership decision): a
// prospect or needs_review resident may have a real AxisCare triage
// value, but isn't currently in Client Readiness's evaluated population
// at all — creating governed compliance evidence for a subject the
// domain doesn't yet audit would be premature. currentRelationship is
// REQUIRED, not optional/defaulted, matching getClientReadinessEvaluation()'s
// own established pattern: the caller resolves the canonical
// ServeRelationshipProjection (a live-AxisCare-fetching, Next.js-only
// pipeline this file must stay free of) and passes the primitive value
// in. When the gate fails, this deliberately does NOT write
// triage_evidence_status to the snapshot row — it stays at its default
// 'not_reviewed' so a later pass, once this resident genuinely becomes
// an active client, can still create evidence from the SAME
// already-fetched snapshot under the same rules, without needing a
// fresh AxisCare fetch.
export async function applyAxisCareTriageEvidenceToResident(
  residentId: string,
  axiscareClientId: string,
  triageRequirementId: string,
  currentRelationship: ServeRelationship,
  actor: string
): Promise<TriageApplyResult> {
  if (currentRelationship !== "active_client") {
    return { residentId, axiscareClientId, status: "skipped_not_active_client" };
  }

  const snapshot = await getAxisCareClientCanonicalSnapshot(axiscareClientId);
  if (!snapshot) {
    return {
      residentId,
      axiscareClientId,
      status: "skipped_no_source_value",
      error: "No AxisCare canonical snapshot found — run the sync step first.",
    };
  }

  if (!snapshot.triage_level_id) {
    await recordSnapshotTriageEvidenceResult(snapshot.id, { status: "skipped_no_source_value" });
    return { residentId, axiscareClientId, status: "skipped_no_source_value" };
  }

  const result = await recordAxisCareTriageEvidence({
    residentId,
    requirementId: triageRequirementId,
    axiscareClientId,
    triageLevelId: snapshot.triage_level_id,
    triageLevelDescription: snapshot.triage_level_description,
    fetchedAt: snapshot.fetched_at,
    actor,
  });

  if (result.error) {
    return { residentId, axiscareClientId, status: "skipped_no_source_value", error: result.error };
  }

  const status = result.alreadyOwnedByServe ? "skipped_serve_already_owns" : "evidence_created";
  await recordSnapshotTriageEvidenceResult(snapshot.id, { status, evidenceId: result.evidence?.id ?? null });

  return { residentId, axiscareClientId, status, evidenceId: result.evidence?.id };
}
