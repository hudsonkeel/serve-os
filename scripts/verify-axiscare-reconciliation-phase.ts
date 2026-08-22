// AxisCare Reconciliation + Multi-Source Identity Ingestion phase — live
// verification. Read-only against Maria Matos's REAL production row
// (AxisCare client #40); every WRITE this script performs uses a
// disposable, synthetic source_record_id, never #40, and is cleaned up in
// a finally block, matching this session's established test-data hygiene
// discipline.
//
// Proves:
//   1. Maria surfaces via getUnresolvedAxisCareWorkForCommunity for
//      Firewheel, and does NOT surface for Frisco/McKinney (read-only).
//   2. The atomic create_resident_from_external_source RPC creates a
//      resident + a confirmed, correctly-typed identity link in one
//      transaction (synthetic fixture only).
//   3. Idempotency: re-running the same create against the same synthetic
//      source_record_id is rejected (unique constraint), never a
//      duplicate resident.
//   4. Concurrency: two "simultaneous" create attempts against the same
//      synthetic source_record_id — only one succeeds.
//   5. The fixture resident, once created, no longer appears in
//      getUnresolvedAxisCareWorkForCommunity (identity resolved).
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-axiscare-reconciliation-phase.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { getUnresolvedAxisCareWorkForCommunity } from "../lib/data/axiscareOperationalState.ts";
import { createResidentFromExternalSource } from "../lib/data/residentCreationFromSource.ts";

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

const SYNTHETIC_SOURCE_RECORD_ID = `TEST-DRYRUN-${Date.now()}`;
const createdResidentIds: string[] = [];

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  if (createdResidentIds.length === 0) return;
  console.log(`\nCleaning up ${createdResidentIds.length} disposable fixture resident(s)...`);
  await supabase.from("person_vendor_identity_links").delete().eq("vendor_record_id", SYNTHETIC_SOURCE_RECORD_ID);
  const { error } = await supabase.from("residents").delete().in("id", createdResidentIds);
  if (error) console.error("[cleanup:error]", error.message);
  else console.log("ok - fixture resident(s) and identity link(s) deleted");
}

async function main() {
  const supabase = createServerClient();

  // ── 1. Maria (real, read-only) surfaces for Firewheel, not elsewhere ──
  const { data: communities } = await supabase.from("communities").select("id,code,name");
  const firewheel = communities?.find((c) => c.code === "watermere_firewheel");
  const frisco = communities?.find((c) => c.code === "watermere_frisco");
  const mckinney = communities?.find((c) => c.code === "watermere_mckinney");
  if (!firewheel || !frisco) fail("Could not resolve Firewheel/Frisco community ids.");

  const firewheelWork = await getUnresolvedAxisCareWorkForCommunity({ mode: "single", communityId: firewheel.id });
  const maria = firewheelWork.find((item) => item.sourceRecordId === "40");
  if (!maria) fail("Maria (AxisCare #40) did not surface in Firewheel's unresolved work — expected exactly this.");
  if (maria.lifecycle !== "prospect") fail(`Maria: expected lifecycle=prospect, got ${maria.lifecycle}`);
  console.log(`ok - Maria surfaces for Firewheel Needs Review: ${maria.vendorDisplayName}, ${maria.lifecycle}, community=${maria.communityName}`);

  const friscoWork = await getUnresolvedAxisCareWorkForCommunity({ mode: "single", communityId: frisco.id });
  if (friscoWork.some((item) => item.sourceRecordId === "40")) fail("Maria incorrectly appeared under Frisco.");
  console.log("ok - Maria does NOT appear under Frisco");

  if (mckinney) {
    const mckinneyWork = await getUnresolvedAxisCareWorkForCommunity({ mode: "single", communityId: mckinney.id });
    if (mckinneyWork.some((item) => item.sourceRecordId === "40")) fail("Maria incorrectly appeared under McKinney.");
    console.log("ok - Maria does NOT appear under McKinney");
  }

  const noneFilterWork = await getUnresolvedAxisCareWorkForCommunity({ mode: "none" });
  if (noneFilterWork.length !== 0) fail("mode:'none' must return [] before any query.");
  console.log("ok - mode:'none' returns [] (no community selected)");

  try {
    // ── 2. Atomic create: resident + confirmed link, one transaction ────
    const created = await createResidentFromExternalSource({
      sourceSystem: "axiscare",
      sourceRecordId: SYNTHETIC_SOURCE_RECORD_ID,
      vendorDisplayName: "Dryrun Fixtureperson",
      firstName: "Dryrun",
      lastName: "Fixtureperson",
      communityId: firewheel.id,
      communityName: firewheel.name,
      actor: "verify-script",
      rationale: "Disposable dry-run fixture — proves the atomic create path, never touches real production data.",
    });
    if (created.error || !created.residentId) fail(`Create failed: ${created.error}`);
    createdResidentIds.push(created.residentId);
    console.log(`ok - created_resident_from_external_source: resident ${created.residentId} created`);

    const { data: link } = await supabase
      .from("person_vendor_identity_links")
      .select("*")
      .eq("source_system", "axiscare")
      .eq("vendor_record_id", SYNTHETIC_SOURCE_RECORD_ID)
      .single();
    if (!link) fail("No person_vendor_identity_links row was created for the fixture.");
    if (link.status !== "confirmed") fail(`Expected status=confirmed, got ${link.status}`);
    if (link.match_method !== "created_new_subject") fail(`Expected match_method=created_new_subject, got ${link.match_method}`);
    if (link.match_confidence !== "not_applicable") fail(`Expected match_confidence=not_applicable, got ${link.match_confidence}`);
    if (link.subject_id !== created.residentId) fail("Link subject_id does not match the created resident.");
    console.log(`ok - identity link is confirmed, match_method=created_new_subject, match_confidence=not_applicable (honest audit semantics, not a fabricated 'high' match)`);

    // ── 3. Idempotency: re-create against the SAME source id must fail ──
    const duplicate = await createResidentFromExternalSource({
      sourceSystem: "axiscare",
      sourceRecordId: SYNTHETIC_SOURCE_RECORD_ID,
      vendorDisplayName: "Dryrun Fixtureperson",
      firstName: "Dryrun",
      lastName: "Fixtureperson",
      communityId: firewheel.id,
      communityName: firewheel.name,
      actor: "verify-script",
      rationale: "Second attempt — must be rejected.",
    });
    if (!duplicate.error || !duplicate.alreadyResolved) fail("A second create against the same source id should have been rejected as already-resolved.");
    console.log(`ok - re-running create against the same source id is rejected cleanly: "${duplicate.error}"`);

    const { count } = await supabase
      .from("residents")
      .select("id", { count: "exact", head: true })
      .eq("first_name", "Dryrun")
      .eq("last_name", "Fixtureperson");
    if (count !== 1) fail(`Expected exactly 1 fixture resident to exist, found ${count}`);
    console.log("ok - no duplicate resident was created");

    // ── 4. Concurrency: two near-simultaneous attempts, only one wins ───
    const CONCURRENT_SOURCE_ID = `TEST-CONCURRENT-${Date.now()}`;
    const [first, second] = await Promise.all([
      createResidentFromExternalSource({
        sourceSystem: "axiscare",
        sourceRecordId: CONCURRENT_SOURCE_ID,
        vendorDisplayName: "Concurrent Fixtureperson",
        firstName: "Concurrent",
        lastName: "Fixtureperson",
        communityId: firewheel.id,
        communityName: firewheel.name,
        actor: "verify-script-a",
        rationale: "Concurrency race fixture A.",
      }),
      createResidentFromExternalSource({
        sourceSystem: "axiscare",
        sourceRecordId: CONCURRENT_SOURCE_ID,
        vendorDisplayName: "Concurrent Fixtureperson",
        firstName: "Concurrent",
        lastName: "Fixtureperson",
        communityId: firewheel.id,
        communityName: firewheel.name,
        actor: "verify-script-b",
        rationale: "Concurrency race fixture B.",
      }),
    ]);
    const succeeded = [first, second].filter((r) => r.residentId);
    const failed = [first, second].filter((r) => r.error);
    if (succeeded.length !== 1 || failed.length !== 1) {
      fail(`Concurrency race: expected exactly 1 success + 1 rejection, got ${succeeded.length} success(es), ${failed.length} rejection(s)`);
    }
    if (succeeded[0].residentId) createdResidentIds.push(succeeded[0].residentId);
    console.log("ok - concurrent double-create against the same source id: exactly one succeeded, the other was cleanly rejected, no duplicate resident");

    // ── 5. Once resolved, the fixture no longer appears as unresolved ───
    const stateInsert = await supabase.from("axiscare_client_operational_state").insert({
      axiscare_client_id: SYNTHETIC_SOURCE_RECORD_ID,
      vendor_display_name: "Dryrun Fixtureperson",
      status_active: true,
      class_codes: [],
      has_contact_info: false,
      resolved_community_id: firewheel.id,
      community_resolution_source: "community_id",
      computed_lifecycle: "prospect",
      is_placeholder_record: false,
      is_name_denylisted: false,
      matched_resident_id: created.residentId,
      identity_status: "confirmed",
      match_basis: "manual_match",
    });
    if (stateInsert.error) fail(`Could not insert fixture operational-state row: ${stateInsert.error.message}`);
    const workAfter = await getUnresolvedAxisCareWorkForCommunity({ mode: "single", communityId: firewheel.id });
    if (workAfter.some((item) => item.sourceRecordId === SYNTHETIC_SOURCE_RECORD_ID)) {
      fail("Fixture still appears as unresolved work after being resolved — matched_resident_id should exclude it.");
    }
    console.log("ok - once matched_resident_id is set, the record no longer appears in unresolved community work");
    await supabase.from("axiscare_client_operational_state").delete().eq("axiscare_client_id", SYNTHETIC_SOURCE_RECORD_ID);

    console.log("\nALL CHECKS PASSED");
  } finally {
    await cleanup(supabase);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
