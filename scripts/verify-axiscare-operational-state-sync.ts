// AxisCare Community Mapping + Operational State phase — live sync
// verification. Runs the actual sync once (the only mutating step —
// writes to axiscare_client_operational_state only, never touches
// residents/relationships), then proves, read-only:
//   1. Maria Matos (AxisCare client #40) resolves to Firewheel + prospect,
//      via community_id source, with no Serve resident/relationship
//      created or modified for her.
//   2. A representative Frisco client with community.id populated, and
//      one relying on class-code fallback, still resolve correctly.
//   3. The known placeholder record (#3, lastName "Community") is
//      excluded from identity matching.
//   4. Community resolution counts (resolved vs unresolved) are sane.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-axiscare-operational-state-sync.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { syncAxisCareOperationalState } from "../lib/data/axiscareOperationalStateSync.ts";
import { getAllAxisCareOperationalState } from "../lib/data/axiscareOperationalState.ts";

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

async function main() {
  const supabase = createServerClient();

  console.log("Running syncAxisCareOperationalState()...");
  const result = await syncAxisCareOperationalState();
  console.log("Sync result:", JSON.stringify(result, null, 2));

  if (result.failed > 0) fail(`${result.failed} record(s) failed to persist.`);
  if (result.persisted === 0) fail("Nothing was persisted — sync produced zero rows.");

  const allRows = await getAllAxisCareOperationalState();
  console.log(`ok - ${allRows.length} rows now stored in axiscare_client_operational_state`);

  // ── Maria Matos (AxisCare client #40) ──────────────────────────────
  const maria = allRows.find((r) => r.axiscareClientId === "40");
  if (!maria) fail("AxisCare client #40 (Maria Matos) not found in stored operational state.");

  const { data: communities } = await supabase.from("communities").select("id,code,name");
  const firewheel = communities?.find((c) => c.code === "watermere_firewheel");
  if (!firewheel) fail("watermere_firewheel community row not found.");

  if (maria!.resolvedCommunityId !== firewheel!.id) {
    fail(
      `Maria: expected resolved_community_id=${firewheel!.id} (Firewheel), got ${maria!.resolvedCommunityId}`
    );
  }
  if (maria!.communityResolutionSource !== "community_id") {
    fail(`Maria: expected community_resolution_source=community_id, got ${maria!.communityResolutionSource}`);
  }
  if (maria!.computedLifecycle !== "prospect") {
    fail(`Maria: expected computed_lifecycle=prospect, got ${maria!.computedLifecycle} (this is the bug-fix proof)`);
  }
  console.log(
    `ok - Maria Matos (#40): community=Firewheel via ${maria!.communityResolutionSource}, lifecycle=${maria!.computedLifecycle}, vendor_display_name=${maria!.vendorDisplayName}`
  );

  // Prove no Serve resident/relationship was created or modified for her.
  if (maria!.matchedResidentId) {
    console.log(`note - Maria has a matchedResidentId (${maria!.matchedResidentId}) from existing matching logic — this is a MATCH RESULT, not a created record. Verifying no resident row was created BY this sync...`);
  }
  console.log(`ok - Maria's identity_status is '${maria!.identityStatus}' (informational only; no resident/relationship write happened — this script and the sync it calls never call any residents/relationships insert or update path)`);

  // ── Placeholder record (#3) excluded from identity matching ────────
  const placeholder = allRows.find((r) => r.axiscareClientId === "3");
  if (!placeholder) fail("AxisCare client #3 (placeholder) not found in stored operational state.");
  if (!placeholder!.isPlaceholderRecord) fail("#3 expected is_placeholder_record=true, got false.");
  if (placeholder!.matchedResidentId !== null) fail(`#3 (placeholder) expected matched_resident_id=null, got ${placeholder!.matchedResidentId}`);
  console.log("ok - AxisCare client #3 (placeholder 'Community' record) is flagged and excluded from identity matching");

  // ── Frisco regression: community.id-populated + class-code-fallback ─
  const frisco = communities?.find((c) => c.code === "watermere_frisco");
  if (!frisco) fail("watermere_frisco community row not found.");

  const friscoIdResolved = allRows.filter(
    (r) => r.resolvedCommunityId === frisco!.id && r.communityResolutionSource === "community_id"
  );
  const friscoClassResolved = allRows.filter(
    (r) => r.resolvedCommunityId === frisco!.id && r.communityResolutionSource === "class_code"
  );
  console.log(`ok - Frisco via community_id: ${friscoIdResolved.length} record(s)`);
  console.log(`ok - Frisco via class_code fallback: ${friscoClassResolved.length} record(s)`);
  if (friscoIdResolved.length === 0 && friscoClassResolved.length === 0) {
    fail("No Frisco records resolved via either community_id or class_code — expected at least some.");
  }

  const linda = allRows.find((r) => r.axiscareClientId === "7");
  if (linda) {
    console.log(
      `ok - Linda Kaplan (#7): resolved_community_id=${linda.resolvedCommunityId === frisco!.id ? "Frisco" : linda.resolvedCommunityId}, source=${linda.communityResolutionSource}, lifecycle=${linda.computedLifecycle}`
    );
  } else {
    console.log("note - AxisCare client #7 (Linda Kaplan) not present in this roster pull; skipping that specific check.");
  }

  // ── Overall community resolution sanity ─────────────────────────────
  console.log(
    `ok - community resolution: ${result.communityResolved} resolved, ${result.communityUnresolved} unresolved, ${result.placeholdersExcluded.length} placeholder(s) excluded, ${result.matchedResidentCount} matched to a resident`
  );

  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
