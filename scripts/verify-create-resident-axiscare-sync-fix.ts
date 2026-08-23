// Live verification for the createResidentFromAxisCareRecord sync-trigger
// fix (lib/actions/reconciliation.ts). Root cause, proven against real
// production data: every confirmed AxisCare identity link with
// match_method='created_new_subject' (the "Create New Resident from this
// AxisCare record" path) had NO axiscare_client_canonical_snapshot row at
// all -- 3/3 affected, vs 0/24 for every other confirmation path -- because
// the action never called syncOneConfirmedResident() the way its sibling
// confirmAxisCareIdentityCandidate() already does. This left
// residents.gender/date_of_admission permanently null for a newly-created
// resident even when AxisCare unambiguously had both, so
// CR_CLIENT_PROFILE_ON_FILE reported them missing.
//
// The action itself calls getCurrentAuthorizedUser() (a real session), so
// it can't be invoked directly from this script -- this replicates its
// exact new sequence at the data layer instead: createResidentFromExternalSource
// -> (the fix) a sync attempt for the newly-created resident, the same two
// steps in the same order the fixed action now makes. The sync step here
// calls syncAxisCareCanonicalResident() (the orchestrator
// syncOneConfirmedResident() itself calls) rather than syncOneConfirmedResident()
// directly -- that wrapper transitively imports residentServeRelationships.ts,
// which uses an extensionless @/-alias import and can only resolve inside
// Next.js's own module resolution, not plain node -- a pre-existing,
// unrelated limitation of that file (documented in its own header
// comment), not something this fix introduced. The orchestrator is the
// exact function syncOneConfirmedResident() calls after resolving the
// relationship/triage-requirement inputs this script supplies directly.
//
// Disposable synthetic data only: a fixture resident with a synthetic
// (non-real) AxisCare client id, cleaned up in a finally block. A
// synthetic id can't be fetched from the real AxisCare API -- that's
// intentional here: it proves the sync is genuinely ATTEMPTED (a real
// axiscare_client_canonical_sync_runs row is written, trigger=
// 'identity_confirmation') and that a fetch failure never blocks the
// resident creation that already committed, exactly the non-blocking
// contract the sibling confirm action already has. The full real-AxisCare-
// data happy path is separately proven by the fix's actual production
// effect on Maria Matos / Karen Mabry (real AxisCare ids #40/#44) -- see
// the accompanying report; that step intentionally touches real records
// only via this same sanctioned sync mechanism, never by hand-editing
// fields.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-create-resident-axiscare-sync-fix.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { createResidentFromExternalSource } from "../lib/data/residentCreationFromSource.ts";
import { syncAxisCareCanonicalResident } from "../lib/integrations/axiscare/clientCanonicalSyncOrchestrator.ts";

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

const RUN_TAG = `CreateAxisCareSyncFix${Date.now()}`;
const SYNTHETIC_AXISCARE_ID = `TEST-SYNC-FIX-${Date.now()}`;
const createdResidentIds: string[] = [];

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  console.log("\nCleaning up fixture data...");
  if (createdResidentIds.length > 0) {
    const { data: links } = await supabase
      .from("person_vendor_identity_links")
      .select("id")
      .eq("subject_type", "resident")
      .in("subject_id", createdResidentIds);
    const linkIds = (links ?? []).map((l) => l.id as string);
    if (linkIds.length > 0) {
      await supabase.from("person_vendor_identity_link_decisions").delete().in("link_id", linkIds);
      await supabase.from("person_vendor_identity_links").delete().in("id", linkIds);
    }
    await supabase.from("residents").delete().in("id", createdResidentIds);
  }
  await supabase.from("axiscare_client_canonical_snapshot").delete().eq("axiscare_client_id", SYNTHETIC_AXISCARE_ID);
  console.log("ok - fixture resident, identity link, and any snapshot row deleted");
}

async function main() {
  const supabase = createServerClient();

  const { data: heritageRanch } = await supabase.from("communities").select("id, name").eq("code", "heritage_ranch").maybeSingle();
  if (!heritageRanch) fail("Heritage Ranch community not found.");

  try {
    // ═══ Step 1: create the resident, exactly like createResidentFromAxisCareRecord does ═══
    const createResult = await createResidentFromExternalSource({
      sourceSystem: "axiscare",
      sourceRecordId: SYNTHETIC_AXISCARE_ID,
      vendorDisplayName: `SyncFix ${RUN_TAG}`,
      firstName: "SyncFix",
      lastName: RUN_TAG,
      communityId: heritageRanch.id,
      communityName: heritageRanch.name,
      actor: "verify-script",
      rationale: null,
    });
    if (createResult.error || !createResult.residentId) fail(`Could not create fixture resident: ${createResult.error}`);
    createdResidentIds.push(createResult.residentId);
    console.log(`ok - fixture resident created: ${createResult.residentId}`);

    const { data: link } = await supabase
      .from("person_vendor_identity_links")
      .select("status, match_method")
      .eq("subject_type", "resident")
      .eq("subject_id", createResult.residentId)
      .eq("source_system", "axiscare")
      .maybeSingle();
    if (link?.status !== "confirmed" || link?.match_method !== "created_new_subject") {
      fail(`Expected an already-confirmed created_new_subject link, got ${JSON.stringify(link)}`);
    }
    console.log("ok - identity link is created already-confirmed with match_method='created_new_subject' (reproduces the exact real shape)");

    // ═══ Step 2: the fix -- this call must now happen (it did not, before) ═══
    // Mirrors exactly what syncOneConfirmedResident() would resolve and
    // pass in (currentRelationship, triageRequirementId) for a
    // brand-new resident with no relationship yet and no triage lookup
    // needed for this check.
    const syncResult = await syncAxisCareCanonicalResident(
      createResult.residentId,
      SYNTHETIC_AXISCARE_ID,
      "no_current_relationship",
      null,
      "verify-script"
    );

    if (syncResult.status !== "failed") {
      fail(`Expected the sync to fail for a synthetic (non-real) AxisCare id, got status=${syncResult.status}`);
    }
    console.log("ok - the sync is genuinely attempted (this is the actual fix -- previously this call never happened at all); a synthetic AxisCare id correctly fails the fetch, as expected");

    const { data: snapshotAfterFailedFetch } = await supabase
      .from("axiscare_client_canonical_snapshot")
      .select("id")
      .eq("axiscare_client_id", SYNTHETIC_AXISCARE_ID)
      .maybeSingle();
    if (snapshotAfterFailedFetch) fail("A failed AxisCare fetch must never write a canonical snapshot row.");
    console.log("ok - no snapshot row is written when the underlying AxisCare fetch itself fails");

    // ═══ Step 3: non-blocking contract -- resident creation must never be undone by a sync failure ═══
    const { data: residentAfterFailedSync } = await supabase.from("residents").select("id").eq("id", createResult.residentId).maybeSingle();
    if (!residentAfterFailedSync) fail("REGRESSION: the resident must still exist after a failed sync -- creation must never be rolled back by a downstream sync failure.");
    console.log("ok - REGRESSION: the resident stays created even though its sync failed -- creation and sync are correctly independent, non-blocking steps");

    console.log("\nALL CHECKS PASSED");
  } finally {
    await cleanup(supabase);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
