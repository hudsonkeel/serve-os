// AxisCare Client Data Sync — the bulk/orchestration conductor. This is
// the one place allowed to combine the live ServeRelationshipProjection
// pipeline (residentServeRelationships.ts) with the per-resident sync
// orchestrator (clientCanonicalSyncOrchestrator.ts) — mirrors
// auditReadinessDashboard.ts's own "conductor" boundary discipline
// exactly: it composes, it never re-implements reconciliation/decision
// logic itself.
import "server-only";
import { syncAxisCareCanonicalResident, type ResidentSyncResult } from "../integrations/axiscare/clientCanonicalSyncOrchestrator.ts";
import { getConfirmedResidentAxisCareLinks } from "./residentAxisCareLinks.ts";
import { getResidentServeRelationshipDetail } from "./residentServeRelationships.ts";
import { getRequirementSetWithRequirements } from "./personRequirements.ts";
import { CLIENT_RECORD_READINESS_SET_CODE } from "../clientReadiness/constants.ts";
import { createServerClient } from "../supabase/server.ts";
import {
  startAxisCareClientSyncRun,
  completeAxisCareClientSyncRun,
  getLatestAxisCareClientSyncRun,
  getLatestSuccessfulAxisCareClientSyncRun,
  type SyncRunTrigger,
} from "./axiscareClientSyncRuns.ts";
import { listUnresolvedConflicts, type AxisCareClientCanonicalSnapshot } from "./axiscareClientCanonicalSnapshot.ts";
import { computeUnresolvedFieldConflicts, combinedAddress, type FieldConflictSummary, type BootstrapFieldName } from "../integrations/axiscare/clientCanonicalReconciliation.ts";

export interface BulkSyncResidentOutcome extends Partial<ResidentSyncResult> {
  residentId: string;
  axiscareClientId: string;
  outcome: "succeeded" | "conflicted" | "failed" | "skipped_not_confirmed" | "skipped_retired_duplicate";
  skipReason?: string;
}

export interface BulkSyncSummary {
  runId: string | null;
  attempted: number;
  succeeded: number;
  conflicted: number;
  failed: number;
  skipped: number;
  residents: BulkSyncResidentOutcome[];
}

async function resolveTriageRequirementId(): Promise<string | null> {
  const set = await getRequirementSetWithRequirements(CLIENT_RECORD_READINESS_SET_CODE);
  return set?.requirements.find((r) => r.requirement_code === "EP_CLIENT_TRIAGE_CLASSIFIED")?.id ?? null;
}

// Only canonical residents ever independently sync — a retired/redirected
// duplicate (resident_identity_redirects.duplicate_resident_id) is
// excluded even if it somehow still carries its own confirmed AxisCare
// link (the identity-matching fix already stops new ones from forming
// this way; this is the belt-and-suspenders check on the sync side).
async function getRetiredDuplicateResidentIds(): Promise<Set<string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("resident_identity_redirects").select("duplicate_resident_id");
  if (error) {
    console.error("[axiscareClientSync:getRetiredDuplicateResidentIds]", { message: error.message });
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.duplicate_resident_id as string));
}

// Syncs exactly one resident on demand — used by the post-Confirm-Match
// trigger (lib/actions/reconciliation.ts) and available for any other
// single-resident caller. Records its own one-resident run for the same
// history the bulk path uses — no separate logging mechanism.
export async function syncOneConfirmedResident(
  residentId: string,
  axiscareClientId: string,
  actor: string,
  trigger: SyncRunTrigger
): Promise<ResidentSyncResult> {
  const runId = await startAxisCareClientSyncRun(trigger, actor);
  const detail = await getResidentServeRelationshipDetail(residentId);
  const triageRequirementId = await resolveTriageRequirementId();

  const result = await syncAxisCareCanonicalResident(
    residentId,
    axiscareClientId,
    detail?.projection.relationship ?? "no_current_relationship",
    triageRequirementId,
    actor
  );

  if (runId) {
    await completeAxisCareClientSyncRun(runId, {
      residentsAttempted: 1,
      residentsSucceeded: result.status !== "failed" ? 1 : 0,
      residentsConflicted: result.status === "synced_with_conflicts" ? 1 : 0,
      residentsFailed: result.status === "failed" ? 1 : 0,
      residentsSkipped: 0,
      errors: result.error ? [{ residentId, message: result.error }] : [],
    });
  }

  return result;
}

// The bulk orchestrator — every confirmed AxisCare<->resident identity,
// one sequential pass (matches syncAllConfirmedResidentsAxisCareCanonicalSnapshot()'s
// existing sequential-not-parallel discipline for the same unfamiliar-
// vendor-API reason). One resident's failure is caught and recorded, never
// aborting the rest — every outcome is accounted for in the summary.
export async function syncAllConfirmedResidentsCanonical(actor: string, trigger: SyncRunTrigger): Promise<BulkSyncSummary> {
  const runId = await startAxisCareClientSyncRun(trigger, actor);

  const [links, retiredDuplicateIds, triageRequirementId] = await Promise.all([
    getConfirmedResidentAxisCareLinks(),
    getRetiredDuplicateResidentIds(),
    resolveTriageRequirementId(),
  ]);

  const residents: BulkSyncResidentOutcome[] = [];
  let succeeded = 0;
  let conflicted = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { residentId: string; message: string }[] = [];

  for (const link of links) {
    const residentId = link.subject_id;
    if (!residentId) {
      skipped += 1;
      residents.push({ residentId: "unknown", axiscareClientId: link.vendor_record_id, outcome: "skipped_not_confirmed", skipReason: "No subject_id on this confirmed link." });
      continue;
    }

    if (retiredDuplicateIds.has(residentId)) {
      skipped += 1;
      residents.push({ residentId, axiscareClientId: link.vendor_record_id, outcome: "skipped_retired_duplicate", skipReason: "This resident has been retired/redirected — a duplicate never independently syncs." });
      continue;
    }

    try {
      const detail = await getResidentServeRelationshipDetail(residentId);
      const result = await syncAxisCareCanonicalResident(
        residentId,
        link.vendor_record_id,
        detail?.projection.relationship ?? "no_current_relationship",
        triageRequirementId,
        actor
      );

      if (result.status === "failed") {
        failed += 1;
        errors.push({ residentId, message: result.error ?? "Unknown sync failure." });
        residents.push({ ...result, outcome: "failed" });
      } else if (result.status === "synced_with_conflicts") {
        conflicted += 1;
        residents.push({ ...result, outcome: "conflicted" });
      } else {
        succeeded += 1;
        residents.push({ ...result, outcome: "succeeded" });
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Unknown error during sync.";
      errors.push({ residentId, message });
      residents.push({ residentId, axiscareClientId: link.vendor_record_id, outcome: "failed", error: message });
    }
  }

  if (runId) {
    await completeAxisCareClientSyncRun(runId, {
      residentsAttempted: succeeded + conflicted + failed,
      residentsSucceeded: succeeded + conflicted,
      residentsConflicted: conflicted,
      residentsFailed: failed,
      residentsSkipped: skipped,
      errors,
    });
  }

  return { runId, attempted: succeeded + conflicted + failed, succeeded, conflicted, failed, skipped, residents };
}

export { getLatestAxisCareClientSyncRun, getLatestSuccessfulAxisCareClientSyncRun };

export interface UnresolvedConflictWithResident {
  snapshot: AxisCareClientCanonicalSnapshot;
  residentId: string | null;
  residentName: string | null;
  // The structured WHAT/WHY the Closed-Loop UX Pass surfaces in place of
  // conflict_notes' plain-text summary — computed live from the
  // resident's CURRENT values (not a stale snapshot of what they were
  // when the conflict was first recorded), using the exact same pure
  // function the apply step itself uses to decide what's still open.
  fieldConflicts: FieldConflictSummary[];
}

const BOOTSTRAP_FIELD_COLUMNS =
  "id, display_name, first_name, last_name, date_of_birth, gender, date_of_admission, address, city, state, zip_code, family_contact_name, family_contact_relationship, family_contact_phone, family_contact_email";

interface ResidentBootstrapRow {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
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

// The snapshot table deliberately has no FK to residents (it's keyed by
// axiscare_client_id so it stays writable before/independent of identity
// resolution — see its own migration header) — so surfacing "which
// resident does this conflict belong to" means joining through the
// confirmed identity link, exactly the same join the sync orchestrator
// itself uses. Read-only; resolves nothing.
export async function getUnresolvedConflictsWithResidents(): Promise<UnresolvedConflictWithResident[]> {
  const [conflicts, links] = await Promise.all([listUnresolvedConflicts(), getConfirmedResidentAxisCareLinks()]);
  if (conflicts.length === 0) return [];

  const residentIdByAxiscareClientId = new Map(links.map((l) => [l.vendor_record_id, l.subject_id]));
  const residentIds = conflicts
    .map((c) => residentIdByAxiscareClientId.get(c.axiscare_client_id))
    .filter((id): id is string => Boolean(id));

  const supabase = createServerClient();
  const residentById = new Map<string, ResidentBootstrapRow>();
  if (residentIds.length > 0) {
    const { data } = await supabase.from("residents").select(BOOTSTRAP_FIELD_COLUMNS).in("id", residentIds);
    for (const r of (data ?? []) as ResidentBootstrapRow[]) {
      residentById.set(r.id, r);
    }
  }

  return conflicts.map((snapshot) => {
    const residentId = residentIdByAxiscareClientId.get(snapshot.axiscare_client_id) ?? null;
    const resident = residentId ? residentById.get(residentId) : undefined;
    const residentName = resident
      ? resident.display_name || `${resident.first_name ?? ""} ${resident.last_name ?? ""}`.trim() || "Unknown Resident"
      : null;

    const axiscareValues: Partial<Record<BootstrapFieldName, string | null>> = {
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

    const fieldConflicts = resident
      ? computeUnresolvedFieldConflicts(resident, axiscareValues, snapshot.field_decisions ?? {}, snapshot.fetched_at)
      : [];

    return { snapshot, residentId, residentName, fieldConflicts };
  });
}
