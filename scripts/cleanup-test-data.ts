// Service-role-only test-data cleanup — see
// docs/engineering/TEST_DATA_HYGIENE.md for the policy this implements.
// Never imported by application code; only ever run by hand from the CLI.
//
// Usage:
//
//   npm run cleanup:test-data -- --legacy-doris [--dry-run]
//   npm run cleanup:test-data -- --marker=<value> [--dry-run]
//   npm run cleanup:test-data -- --wellness-title="<exact title>" [--dry-run]
//
// --legacy-doris   Removes the specific, pre-marker-era synthetic records
//                   documented in TEST_DATA_HYGIENE.md's "Known Doris
//                   Kakazu cleanup" section (hardcoded IDs — this predates
//                   the test_marker column, so nothing to query by).
// --marker=<value> Removes every relationships row whose test_marker
//                   exactly matches <value>, plus every dependent row
//                   reachable through relationship_id, in dependency
//                   order. This is the mechanism every future
//                   live-database verification run should use.
// --wellness-title="<exact title>"
//                   Removes a resident_wellness_follow_ups row matched by
//                   an exact title (resident_wellness_follow_ups has no
//                   test_marker-style column — see TEST_DATA_HYGIENE.md —
//                   so a distinctly unique title, per the
//                   "__SERVE_TEST__ <purpose> <run-id>" naming pattern, is
//                   the only reliable handle). Also removes its
//                   resident_wellness_follow_up_edits and any
//                   resident_timeline rows generated for it (matched by
//                   resident_id + source + the title appearing in
//                   event_title, since resident_timeline has no
//                   source_record_id column to join on precisely).
// --dry-run         Prints what would be deleted without deleting it.
//
// Never touches the residents table under any code path.
import { createServerClient } from "../lib/supabase/server.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const markerArg = args.find((a) => a.startsWith("--marker="));
const legacyDoris = args.includes("--legacy-doris");
const wellnessTitleArg = args.find((a) => a.startsWith("--wellness-title="));

const supabase = createServerClient();

async function deleteByColumnIn(
  table: string,
  column: string,
  values: readonly string[]
): Promise<number> {
  if (values.length === 0) return 0;

  if (dryRun) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, values);
    if (error) throw new Error(`[${table}] count failed: ${error.message}`);
    console.log(`  [dry-run] would delete ${count ?? 0} row(s) from ${table}`);
    return count ?? 0;
  }

  const { error, count } = await supabase.from(table).delete({ count: "exact" }).in(column, values);
  if (error) throw new Error(`[${table}] delete failed: ${error.message}`);
  console.log(`  deleted ${count ?? 0} row(s) from ${table}`);
  return count ?? 0;
}

// Cascades through every relationship_* table in dependency order, then
// the relationships rows themselves. Shared by both the marker-based path
// and the legacy Doris path.
async function cleanupRelationshipsByIds(relationshipIds: readonly string[]): Promise<void> {
  if (relationshipIds.length === 0) {
    console.log("No relationships matched — nothing to clean up.");
    return;
  }

  console.log(`Relationships to remove: ${relationshipIds.join(", ")}`);

  const { data: actionRows } = await supabase
    .from("relationship_actions")
    .select("id")
    .in("relationship_id", relationshipIds);
  const actionIds = (actionRows ?? []).map((r) => r.id as string);

  await deleteByColumnIn("relationship_action_edits", "relationship_action_id", actionIds);
  await deleteByColumnIn("relationship_actions", "relationship_id", relationshipIds);
  await deleteByColumnIn("relationship_touches", "relationship_id", relationshipIds);
  await deleteByColumnIn("relationship_stage_history", "relationship_id", relationshipIds);
  await deleteByColumnIn("relationship_conversions", "relationship_id", relationshipIds);
  await deleteByColumnIn("relationship_timeline", "relationship_id", relationshipIds);
  await deleteByColumnIn("relationship_working_notes", "relationship_id", relationshipIds);
  await deleteByColumnIn("relationship_service_opportunities", "relationship_id", relationshipIds);
  await deleteByColumnIn("relationship_service_locations", "relationship_id", relationshipIds);
  await deleteByColumnIn("external_clients", "relationship_id", relationshipIds);
  await deleteByColumnIn("relationships", "id", relationshipIds);
}

async function cleanupByMarker(marker: string): Promise<void> {
  console.log(`\n=== Cleaning up by test_marker = "${marker}" ${dryRun ? "(dry run)" : ""} ===`);

  const { data, error } = await supabase.from("relationships").select("id").eq("test_marker", marker);
  if (error) throw new Error(`Lookup by test_marker failed: ${error.message}`);

  const relationshipIds = (data ?? []).map((r) => r.id as string);
  await cleanupRelationshipsByIds(relationshipIds);

  if (!dryRun) {
    const { count } = await supabase
      .from("relationships")
      .select("*", { count: "exact", head: true })
      .eq("test_marker", marker);
    console.log(`\nVerification: ${count ?? 0} relationships remain with test_marker = "${marker}" (expect 0).`);
  }
}

// Hardcoded IDs from TEST_DATA_HYGIENE.md's "Known Doris Kakazu cleanup" —
// these predate the test_marker column, so there is nothing to query by;
// every ID here was identified by exact content/actor inspection before
// this script was written (see that doc for the reasoning). The
// resident_created resident_timeline row is deliberately never touched.
const LEGACY_RELATIONSHIP_IDS = [
  "414f18d8-bec6-421f-9579-834603d02bd7", // VERIFY TEST — Smith Family Inquiry
  "559656a6-7c18-456f-a8d7-32840bac73ac", // Doris Kakazu — Prospect
];
const LEGACY_WELLNESS_FOLLOW_UP_IDS = [
  "b09cbf1c-c08b-42b9-9a35-06eed906e89d", // "Resident Check-in"
  "fee5987d-3abf-4b47-b58a-605d760f69ec", // "Dismiss-After-Edit Test"
];
const LEGACY_WORKING_NOTE_IDS = [
  "b0ffe475-2a20-41f6-8b92-a3f50b79b3c3",
  "e346c280-7338-450d-a6f2-9862c7972a89",
];
const LEGACY_DORIS_RESIDENT_ID = "3d2253e6-a972-4aa2-9e3d-fc54316e7702";
// Every resident_current_needs row for Doris is synthetic (the entire
// version history — see TEST_DATA_HYGIENE.md), so this path deletes by
// resident_id rather than an explicit ID list.
// resident_timeline is also deleted by resident_id, EXCEPT the one
// legitimate "resident_created" row, excluded explicitly below.

async function cleanupLegacyDoris(): Promise<void> {
  console.log(`\n=== Legacy Doris Kakazu cleanup ${dryRun ? "(dry run)" : ""} ===`);

  await cleanupRelationshipsByIds(LEGACY_RELATIONSHIP_IDS);

  await deleteByColumnIn("resident_wellness_follow_up_edits", "follow_up_id", LEGACY_WELLNESS_FOLLOW_UP_IDS);
  await deleteByColumnIn("resident_wellness_follow_ups", "id", LEGACY_WELLNESS_FOLLOW_UP_IDS);
  await deleteByColumnIn("resident_working_notes", "id", LEGACY_WORKING_NOTE_IDS);

  const { data: needsRows } = await supabase
    .from("resident_current_needs")
    .select("id")
    .eq("resident_id", LEGACY_DORIS_RESIDENT_ID);
  await deleteByColumnIn("resident_current_needs", "id", (needsRows ?? []).map((r) => r.id as string));

  const { data: timelineRows } = await supabase
    .from("resident_timeline")
    .select("id, event_type")
    .eq("resident_id", LEGACY_DORIS_RESIDENT_ID);
  const timelineIdsToDelete = (timelineRows ?? [])
    .filter((r) => r.event_type !== "resident_created")
    .map((r) => r.id as string);
  await deleteByColumnIn("resident_timeline", "id", timelineIdsToDelete);

  if (!dryRun) {
    const { data: residentStillThere } = await supabase
      .from("residents")
      .select("id")
      .eq("id", LEGACY_DORIS_RESIDENT_ID)
      .maybeSingle();
    console.log(
      `\nVerification: Doris Kakazu resident record ${residentStillThere ? "still present (correct)" : "MISSING — investigate immediately"}.`
    );

    const { count: remainingTimeline } = await supabase
      .from("resident_timeline")
      .select("*", { count: "exact", head: true })
      .eq("resident_id", LEGACY_DORIS_RESIDENT_ID);
    console.log(`Verification: ${remainingTimeline ?? 0} resident_timeline row(s) remain for Doris (expect 1: resident_created).`);
  }
}

async function cleanupWellnessFollowUpByTitle(title: string): Promise<void> {
  console.log(`\n=== Cleaning up wellness follow-up titled "${title}" ${dryRun ? "(dry run)" : ""} ===`);

  const { data, error } = await supabase
    .from("resident_wellness_follow_ups")
    .select("id, resident_id")
    .eq("title", title);
  if (error) throw new Error(`Lookup by title failed: ${error.message}`);

  const followUpIds = (data ?? []).map((r) => r.id as string);
  const residentIds = [...new Set((data ?? []).map((r) => r.resident_id as string))];

  if (followUpIds.length === 0) {
    console.log("No wellness follow-ups matched — nothing to clean up.");
    return;
  }
  console.log(`Follow-ups to remove: ${followUpIds.join(", ")}`);

  await deleteByColumnIn("resident_wellness_follow_up_edits", "follow_up_id", followUpIds);
  await deleteByColumnIn("resident_wellness_follow_ups", "id", followUpIds);

  // resident_timeline has no source_record_id column — match by
  // resident_id + source + the exact title text inside event_title
  // ("<title> follow-up updated." per update_resident_wellness_follow_up()).
  for (const residentId of residentIds) {
    const { data: timelineRows } = await supabase
      .from("resident_timeline")
      .select("id, event_title")
      .eq("resident_id", residentId)
      .eq("source", "resident_wellness_follow_ups")
      .ilike("event_title", `${title}%`);
    const timelineIds = (timelineRows ?? []).map((r) => r.id as string);
    await deleteByColumnIn("resident_timeline", "id", timelineIds);
  }

  if (!dryRun) {
    const { count } = await supabase
      .from("resident_wellness_follow_ups")
      .select("*", { count: "exact", head: true })
      .eq("title", title);
    console.log(`\nVerification: ${count ?? 0} wellness follow-ups remain titled "${title}" (expect 0).`);
  }
}

async function main() {
  if (!legacyDoris && !markerArg && !wellnessTitleArg) {
    console.error(
      "Usage: npm run cleanup:test-data -- --legacy-doris | --marker=<value> | --wellness-title=<title> [--dry-run]"
    );
    process.exit(1);
  }

  if (legacyDoris) {
    await cleanupLegacyDoris();
  }

  if (markerArg) {
    const marker = markerArg.slice("--marker=".length);
    if (!marker) {
      console.error("--marker requires a value, e.g. --marker=__SERVE_TEST__foo-20260716T000000Z-abcd");
      process.exit(1);
    }
    await cleanupByMarker(marker);
  }

  if (wellnessTitleArg) {
    const title = wellnessTitleArg.slice("--wellness-title=".length);
    if (!title) {
      console.error('--wellness-title requires a value, e.g. --wellness-title="__SERVE_TEST__ wellness-overdue-edit 20260716T000000Z-abcd"');
      process.exit(1);
    }
    await cleanupWellnessFollowUpByTitle(title);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Cleanup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
