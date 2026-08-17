// Data access for axiscare_client_canonical_snapshot
// (supabase/migrations/20260902120000_create_axiscare_client_canonical_snapshot.sql
// — NOT YET APPLIED). Mirrors lib/data/axiscareClientDispositions.ts's
// exact shape: one current-state row per axiscare_client_id, upserted in
// place, never a history log.
import { createServerClient } from "../supabase/server.ts";

export type CanonicalizationStatus =
  | "not_reviewed"
  | "applied_to_serve"
  | "skipped_serve_already_owns"
  | "conflict_unresolved";

export type ConflictStatus = "value_disagrees_with_serve" | "ambiguous_source" | null;

export type TriageEvidenceStatus =
  | "not_reviewed"
  | "evidence_created"
  | "skipped_serve_already_owns"
  | "skipped_no_source_value";

export interface AxisCareClientCanonicalSnapshot {
  id: string;
  axiscare_client_id: string;
  date_of_birth: string | null;
  gender: string | null;
  admission_date: string | null;
  street_address_1: string | null;
  street_address_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  triage_level_id: string | null;
  triage_level_description: string | null;
  triage_evidence_status: TriageEvidenceStatus;
  triage_evidence_id: string | null;
  responsible_party_name: string | null;
  responsible_party_relationship: string | null;
  responsible_party_phone: string | null;
  responsible_party_email: string | null;
  responsible_party_can_make_medical_decisions: string | null;
  fetched_at: string;
  source_response_hash: string | null;
  canonicalization_status: CanonicalizationStatus;
  conflict_status: ConflictStatus;
  conflict_notes: string | null;
  applied_to_serve_at: string | null;
  applied_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AxisCareClientCanonicalSnapshotFields {
  dateOfBirth: string | null;
  gender: string | null;
  admissionDate: string | null;
  streetAddress1: string | null;
  streetAddress2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  triageLevelId: string | null;
  triageLevelDescription: string | null;
  responsiblePartyName: string | null;
  responsiblePartyRelationship: string | null;
  responsiblePartyPhone: string | null;
  responsiblePartyEmail: string | null;
  responsiblePartyCanMakeMedicalDecisions: string | null;
  sourceResponseHash: string | null;
}

// One row per axiscare_client_id — a fresh fetch overwrites in place
// (fetched_at marks currency), matching axiscare_client_dispositions'
// established precedent. canonicalization_status/conflict_status are
// deliberately NOT reset here — those are the apply step's concern
// (clientCanonicalApply.ts), never overwritten by a mere re-fetch.
export async function upsertAxisCareClientCanonicalSnapshot(
  axiscareClientId: string,
  fields: AxisCareClientCanonicalSnapshotFields
): Promise<{ snapshot?: AxisCareClientCanonicalSnapshot; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("axiscare_client_canonical_snapshot")
    .upsert(
      {
        axiscare_client_id: axiscareClientId,
        date_of_birth: fields.dateOfBirth,
        gender: fields.gender,
        admission_date: fields.admissionDate,
        street_address_1: fields.streetAddress1,
        street_address_2: fields.streetAddress2,
        city: fields.city,
        state: fields.state,
        postal_code: fields.postalCode,
        triage_level_id: fields.triageLevelId,
        triage_level_description: fields.triageLevelDescription,
        responsible_party_name: fields.responsiblePartyName,
        responsible_party_relationship: fields.responsiblePartyRelationship,
        responsible_party_phone: fields.responsiblePartyPhone,
        responsible_party_email: fields.responsiblePartyEmail,
        responsible_party_can_make_medical_decisions: fields.responsiblePartyCanMakeMedicalDecisions,
        fetched_at: new Date().toISOString(),
        source_response_hash: fields.sourceResponseHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "axiscare_client_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not upsert AxisCare client canonical snapshot for ${axiscareClientId}: ${error?.message}` };
  }

  return { snapshot: data as AxisCareClientCanonicalSnapshot };
}

export async function getAxisCareClientCanonicalSnapshot(
  axiscareClientId: string
): Promise<AxisCareClientCanonicalSnapshot | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("axiscare_client_canonical_snapshot")
    .select("*")
    .eq("axiscare_client_id", axiscareClientId)
    .maybeSingle();

  if (error) {
    console.error("[getAxisCareClientCanonicalSnapshot]", { axiscareClientId, message: error.message });
    return null;
  }

  return (data as AxisCareClientCanonicalSnapshot | null) ?? null;
}

export async function recordSnapshotCanonicalizationResult(
  snapshotId: string,
  result: {
    status: CanonicalizationStatus;
    conflictStatus?: ConflictStatus;
    conflictNotes?: string | null;
    appliedBy?: string | null;
  }
): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("axiscare_client_canonical_snapshot")
    .update({
      canonicalization_status: result.status,
      conflict_status: result.conflictStatus ?? null,
      conflict_notes: result.conflictNotes ?? null,
      applied_to_serve_at: result.status === "applied_to_serve" ? new Date().toISOString() : null,
      applied_by: result.status === "applied_to_serve" ? (result.appliedBy ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", snapshotId);

  if (error) {
    return { error: `Could not record canonicalization result for snapshot ${snapshotId}: ${error.message}` };
  }
  return {};
}

// Triage is an EVIDENCE fact (a person_evidence row), not a residents
// column — tracked separately from canonicalization_status/
// applied_to_serve_at above, which are scoped to residents-column facts
// only. See recordAxisCareTriageEvidence() in lib/clientReadiness/evidence.ts,
// the only writer of person_evidence this bootstrap uses.
export async function recordSnapshotTriageEvidenceResult(
  snapshotId: string,
  result: { status: TriageEvidenceStatus; evidenceId?: string | null }
): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("axiscare_client_canonical_snapshot")
    .update({
      triage_evidence_status: result.status,
      triage_evidence_id: result.evidenceId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", snapshotId);

  if (error) {
    return { error: `Could not record triage evidence result for snapshot ${snapshotId}: ${error.message}` };
  }
  return {};
}

export async function listUnresolvedConflicts(): Promise<AxisCareClientCanonicalSnapshot[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("axiscare_client_canonical_snapshot")
    .select("*")
    .eq("canonicalization_status", "conflict_unresolved")
    .order("fetched_at", { ascending: false });

  if (error) {
    console.error("[listUnresolvedConflicts]", { message: error.message });
    return [];
  }
  return (data as AxisCareClientCanonicalSnapshot[] | null) ?? [];
}
