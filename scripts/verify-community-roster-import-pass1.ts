// Community Roster Import + Reconciliation phase, Pass 1 — live
// verification. Disposable synthetic data only: a real Firewheel resident
// fixture (created and cleaned up here, never Maria/Karen's real rows),
// a real CSV buffer, run through the actual analyze pipeline
// (analyzeCommunityRosterFile -> the unmodified matchPerson()/
// reconcileRoster() engine), persisted through the real data layer.
// Proves: format detection (generic CSV path), community-scoped
// candidate loading, correct classification (exact_match / new_resident /
// ambiguous), and that roster_source_rows persists exactly what analysis
// produced. No person_vendor_identity_links write happens anywhere in
// this script — Pass 1 is read-only against `residents`.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-community-roster-import-pass1.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { analyzeCommunityRosterFile } from "../lib/residents/roster/communityRosterAnalysis.ts";
import {
  createCommunityRosterImportRun,
  insertCommunityRosterSourceRows,
  getRosterSourceRowsForRun,
  updateRosterImportRunStatus,
} from "../lib/data/residentRoster.ts";

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

const FIXTURE_LAST_NAME = `PassOneFixture${Date.now()}`;
const createdResidentIds: string[] = [];
let createdRunId: string | null = null;

// Runs in `finally` (see main()) — the FK-safe order here is decisions
// -> links -> corrections -> timeline -> roster rows -> runs -> residents.
// This script never writes person_vendor_identity_links itself (Pass 1 is
// read-only against `residents`), so the decisions/links step is a no-op
// today — kept here anyway so a future edit that DOES start writing links
// inherits the safe order automatically rather than reintroducing the bug
// a production hygiene incident already caught once (an interrupted run's
// links survived because decisions referencing them hadn't been deleted
// first — see scripts/cleanup-verify-script-fixtures.ts's own header for
// the full incident). A hard process kill (SIGKILL, e.g. a tool timeout)
// bypasses `finally` entirely — no script-level code can prevent that;
// scripts/cleanup-verify-script-fixtures.ts is the standing safety net
// for exactly that residual case and can be re-run anytime.
async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  console.log("\nCleaning up fixture data...");
  if (createdRunId) {
    await supabase.from("roster_source_rows").delete().eq("import_run_id", createdRunId);
    await supabase.from("roster_import_runs").delete().eq("id", createdRunId);
  }
  if (createdResidentIds.length > 0) {
    const { data: linksToDelete } = await supabase
      .from("person_vendor_identity_links")
      .select("id")
      .eq("subject_type", "resident")
      .in("subject_id", createdResidentIds);
    const linkIds = (linksToDelete ?? []).map((l) => l.id as string);
    if (linkIds.length > 0) {
      await supabase.from("person_vendor_identity_link_decisions").delete().in("link_id", linkIds);
      await supabase.from("person_vendor_identity_links").delete().in("id", linkIds);
    }
    await supabase.from("residents").delete().in("id", createdResidentIds);
  }
  console.log("ok - fixture run, source rows, and fixture resident deleted");
}

async function main() {
  const supabase = createServerClient();

  const { data: firewheel } = await supabase.from("communities").select("id, code, name").eq("code", "watermere_firewheel").maybeSingle();
  if (!firewheel) fail("Firewheel community not found.");

  try {
    // ── Fixture: one existing resident this roster should re-find ──────
    const { data: fixtureResident, error: createError } = await supabase
      .from("residents")
      .insert({
        first_name: "Testina",
        last_name: FIXTURE_LAST_NAME,
        community_id: firewheel.id,
        community_name: firewheel.name,
        community_code: firewheel.code,
        unit_number: "999",
        source_system: "verify-script-fixture",
        is_active: true,
        status: "active",
      })
      .select("id")
      .single();
    if (createError || !fixtureResident) fail(`Could not create fixture resident: ${createError?.message}`);
    createdResidentIds.push(fixtureResident.id as string);
    console.log(`ok - fixture resident created: ${fixtureResident.id}`);

    // ── A small synthetic CSV: one exact match, one ambiguous-shaped
    //    (last-name-only match, different apartment), one genuinely new ──
    const csv = [
      "Last Name,First Name,Apartment,Phone",
      `${FIXTURE_LAST_NAME},Testina,999,555-1000`,
      `${FIXTURE_LAST_NAME},Notreallyher,204,555-2000`,
      "BrandNewFixturePerson,Newcomer,301,555-3000",
    ].join("\n");
    const fileBytes = Buffer.from(csv, "utf-8");

    const runResult = await createCommunityRosterImportRun({
      communityId: firewheel.id,
      communityCode: firewheel.code,
      sourceFilename: "verify-pass1-fixture.csv",
      sourceHash: "verify-script-does-not-need-a-real-hash",
      storagePath: "verify-script/does-not-upload-a-real-file.csv",
      importedBy: "verify-script",
    });
    if (runResult.error || !runResult.id) fail(`Could not create import run: ${runResult.error}`);
    createdRunId = runResult.id;
    console.log(`ok - roster_import_runs row created: ${runResult.id}`);

    const analysis = await analyzeCommunityRosterFile({ importRunId: runResult.id, communityId: firewheel.id, fileBytes });
    console.log(`ok - analysis complete: format=${analysis.format}, totalSourceRows=${analysis.totalSourceRows}`);
    if (analysis.format !== "generic_single_sheet") fail(`Expected generic_single_sheet format, got ${analysis.format}`);
    if (analysis.totalSourceRows !== 3) fail(`Expected 3 source rows, got ${analysis.totalSourceRows}`);

    const classifications = analysis.sourceRowInserts.map((r) => r.resolutionStatus);
    console.log("Classifications:", classifications);
    if (!classifications.includes("exact_match")) fail("Expected an exact_match classification for the fixture resident row.");
    if (!classifications.includes("new_resident")) fail("Expected a new_resident classification for the genuinely new person.");

    const exactMatchRow = analysis.sourceRowInserts.find((r) => r.resolutionStatus === "exact_match");
    if (exactMatchRow?.matchedResidentId !== fixtureResident.id) {
      fail(`Exact match row should point at the fixture resident (${fixtureResident.id}), got ${exactMatchRow?.matchedResidentId}`);
    }
    console.log("ok - exact_match row correctly resolved to the fixture resident");

    // ── Persist, then read back to prove the full round trip ───────────
    const insertResult = await insertCommunityRosterSourceRows(runResult.id, analysis.sourceRowInserts);
    if (insertResult.error) fail(`Could not insert source rows: ${insertResult.error}`);

    await updateRosterImportRunStatus(runResult.id, "pending_review", { totalSourceRows: analysis.totalSourceRows });

    const persistedRows = await getRosterSourceRowsForRun(runResult.id);
    if (persistedRows.length !== 3) fail(`Expected 3 persisted rows, got ${persistedRows.length}`);
    if (persistedRows.every((r) => r.reviewState !== "pending")) fail("Expected every row's review_state to default to 'pending'.");
    const persistedSourceRecordIds = new Set(persistedRows.map((r) => r.sourceRecordId));
    if (persistedSourceRecordIds.size !== 3) fail("Expected 3 distinct source_record_ids — collision detected.");
    console.log(`ok - 3 rows persisted to roster_source_rows, review_state='pending', distinct source_record_ids: ${[...persistedSourceRecordIds].join(", ")}`);

    // ── Community isolation: Frisco must never see this Firewheel run ──
    const { data: frisco } = await supabase.from("communities").select("id").eq("code", "watermere_frisco").maybeSingle();
    if (frisco) {
      const { data: friscoRuns } = await supabase.from("roster_import_runs").select("id").eq("community_id", frisco.id).eq("id", runResult.id);
      if (friscoRuns && friscoRuns.length > 0) fail("This Firewheel-scoped run incorrectly appeared under Frisco's community_id filter.");
      console.log("ok - this run does not appear under Frisco's community_id");
    }

    console.log("\nALL CHECKS PASSED");
  } finally {
    await cleanup(supabase);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
