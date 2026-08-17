// AxisCare Client Data Sync — the per-resident conductor. Composes the
// three existing, already-safety-gated primitives (never a second engine):
//   1. syncOneAxisCareClientCanonicalSnapshot (clientCanonicalSync.ts) —
//      fetch + snapshot, read-only against AxisCare.
//   2. applyAxisCareCanonicalSnapshotToResident (clientCanonicalApply.ts) —
//      gap-fill residents columns, conflicts surfaced never auto-resolved.
//   3. applyAxisCareTriageEvidenceToResident (clientCanonicalApply.ts) —
//      governed person_evidence for EP_CLIENT_TRIAGE_CLASSIFIED.
// This module adds ZERO new reconciliation/decision logic of its own —
// it only sequences the three calls and shapes their combined result into
// one structured report. Every safety rule (gap-fill only, conflicts
// require human review, no relationship-status mutation, no medication/
// raw-payload storage, no AxisCare writes) lives entirely in the
// primitives above, unchanged.
import "server-only";
import { syncOneAxisCareClientCanonicalSnapshot } from "./clientCanonicalSync.ts";
import { applyAxisCareCanonicalSnapshotToResident, applyAxisCareTriageEvidenceToResident } from "./clientCanonicalApply.ts";
import { classifyFieldForPreview } from "./clientCanonicalReconciliation.ts";
import { getAxisCareClientCanonicalSnapshot } from "../../data/axiscareClientCanonicalSnapshot.ts";
import { createServerClient } from "../../supabase/server.ts";
import type { ServeRelationship } from "../../residents/serveRelationshipProjection.ts";

export type ResidentSyncStatus = "synced" | "synced_with_conflicts" | "failed";

export interface ResidentSyncResult {
  residentId: string;
  axiscareClientId: string;
  status: ResidentSyncStatus;
  fieldsApplied: string[];
  fieldsAlreadyAgreeing: string[];
  fieldsSourceAbsent: string[];
  conflicts: string[];
  triageEvidence: "created" | "already_current" | "no_source_value" | "not_eligible_not_active_client" | "not_attempted";
  triageEvidenceId?: string;
  error?: string;
}

interface ResidentFieldSnapshotShape {
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

const RESIDENT_FIELD_COLUMNS =
  "date_of_birth, gender, date_of_admission, address, city, state, zip_code, family_contact_name, family_contact_relationship, family_contact_phone, family_contact_email";

function combinedAddress(street1: string | null, street2: string | null): string | null {
  if (!street1) return null;
  return street2 ? `${street1}, ${street2}` : street1;
}

// One resident, one AxisCare client id, exactly the desired sequence:
// refresh snapshot -> reconcile residents columns -> refresh triage
// evidence -> return one structured report. The preview classification
// (fieldsAlreadyAgreeing/fieldsSourceAbsent) is read from the resident row
// BEFORE the apply step runs, using the same pure classifyFieldForPreview()
// this codebase already built for exactly this reporting purpose — never a
// second decision engine, only a second (read-only) lens on the same
// values the apply step itself compares.
export async function syncAxisCareCanonicalResident(
  residentId: string,
  axiscareClientId: string,
  currentRelationship: ServeRelationship,
  // Resolved by the caller (lib/data/axiscareClientSync.ts), exactly
  // mirroring applyAxisCareTriageEvidenceToResident()'s own established
  // pattern — this file never queries person_requirements itself.
  triageRequirementId: string | null,
  actor: string
): Promise<ResidentSyncResult> {
  const syncResult = await syncOneAxisCareClientCanonicalSnapshot(axiscareClientId, residentId);
  if (!syncResult.ok) {
    return {
      residentId,
      axiscareClientId,
      status: "failed",
      fieldsApplied: [],
      fieldsAlreadyAgreeing: [],
      fieldsSourceAbsent: [],
      conflicts: [],
      triageEvidence: "not_attempted",
      error: syncResult.error ?? "AxisCare fetch failed.",
    };
  }

  const snapshot = await getAxisCareClientCanonicalSnapshot(axiscareClientId);
  if (!snapshot) {
    return {
      residentId,
      axiscareClientId,
      status: "failed",
      fieldsApplied: [],
      fieldsAlreadyAgreeing: [],
      fieldsSourceAbsent: [],
      conflicts: [],
      triageEvidence: "not_attempted",
      error: "Snapshot was fetched but could not be read back.",
    };
  }

  // Read-only preview classification, using the resident's values as they
  // stand right now (before apply writes anything) — purely for reporting
  // "already agreeing" vs. "source has nothing to offer" as two distinct
  // buckets; the apply step below makes its own, independent, authoritative
  // decision per field via decideFieldReconciliation().
  const supabase = createServerClient();
  const { data: residentRow } = await supabase.from("residents").select(RESIDENT_FIELD_COLUMNS).eq("id", residentId).maybeSingle();
  const resident = residentRow as ResidentFieldSnapshotShape | null;
  const axiscareValues: ResidentFieldSnapshotShape = {
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

  const fieldsAlreadyAgreeing: string[] = [];
  const fieldsSourceAbsent: string[] = [];
  if (resident) {
    for (const field of Object.keys(axiscareValues) as (keyof ResidentFieldSnapshotShape)[]) {
      const preview = classifyFieldForPreview(resident[field], axiscareValues[field]);
      if (preview === "ALREADY_AGREES") fieldsAlreadyAgreeing.push(field);
      if (preview === "AXISCARE_EMPTY") fieldsSourceAbsent.push(field);
    }
  }

  const applyResult = await applyAxisCareCanonicalSnapshotToResident(residentId, axiscareClientId, actor);
  if (applyResult.error) {
    return {
      residentId,
      axiscareClientId,
      status: "failed",
      fieldsApplied: [],
      fieldsAlreadyAgreeing,
      fieldsSourceAbsent,
      conflicts: [],
      triageEvidence: "not_attempted",
      error: applyResult.error,
    };
  }

  const conflicts = Object.entries(applyResult.fieldOutcomes)
    .filter(([, outcome]) => outcome === "conflict_unresolved")
    .map(([field]) => field);

  let triageEvidence: ResidentSyncResult["triageEvidence"] = "not_attempted";
  let triageEvidenceId: string | undefined;

  if (!triageRequirementId) {
    triageEvidence = "not_attempted";
  } else {
    const triageResult = await applyAxisCareTriageEvidenceToResident(residentId, axiscareClientId, triageRequirementId, currentRelationship, actor);
    triageEvidence =
      triageResult.status === "evidence_created"
        ? "created"
        : triageResult.status === "skipped_serve_already_owns"
          ? "already_current"
          : triageResult.status === "skipped_not_active_client"
            ? "not_eligible_not_active_client"
            : "no_source_value";
    triageEvidenceId = triageResult.evidenceId;
  }

  return {
    residentId,
    axiscareClientId,
    status: conflicts.length > 0 ? "synced_with_conflicts" : "synced",
    fieldsApplied: applyResult.fieldsApplied,
    fieldsAlreadyAgreeing,
    fieldsSourceAbsent,
    conflicts,
    triageEvidence,
    triageEvidenceId,
  };
}
