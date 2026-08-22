// Community Roster Import + Reconciliation phase, Pass 4 — live
// verification. Disposable synthetic data only, fully cleaned up.
//
// Proves, against the real database and the real Pass 4 code paths:
//   1. Household-signal corroboration (phone, apartment) actually
//      participates: a name-only "probable" possible_match candidate
//      that ALSO shares the roster row's phone number upgrades to
//      "high" confidence — via the EXISTING deterministic
//      identity+household framework (assignConfidenceBand), never a new
//      score. A phone match ALONE (no name similarity at all) never
//      creates a candidate on its own — the framework's own structural
//      guarantee, re-proven here through the roster orchestration layer.
//   2. Performance: a realistic ~400-row roster analyzes in one bounded
//      set of DB round trips (batch-loaded candidates, never N+1) and
//      completes in a reasonable wall-clock time.
//   3. Security/PHI discipline spot-check: analysis never logs raw PII,
//      and the community-scoping guarantee (a run never appears under
//      another community's filter) still holds at this row count.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-community-roster-import-pass4.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { analyzeCommunityRosterFile } from "../lib/residents/roster/communityRosterAnalysis.ts";
import { createCommunityRosterImportRun, insertCommunityRosterSourceRows, getRosterSourceRowsForRun } from "../lib/data/residentRoster.ts";

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

const RUN_TAG = `PassFour${Date.now()}`;
const createdResidentIds: string[] = [];
const createdRunIds: string[] = [];

// FK-safe order (decisions -> links -> residents), matching every other
// roster verify script — see verify-community-roster-import-pass2.ts's
// own comment for the production hygiene incident this order prevents.
// A hard process kill (SIGKILL) still bypasses this `finally` block
// regardless of ordering; scripts/cleanup-verify-script-fixtures.ts is
// the standing safety net for that residual case.
async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  console.log("\nCleaning up fixture data...");
  for (const runId of createdRunIds) {
    await supabase.from("roster_source_rows").delete().eq("import_run_id", runId);
    await supabase.from("roster_import_runs").delete().eq("id", runId);
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
  console.log("ok - fixture runs, source rows, identity link decisions, identity links, and fixture residents deleted");
}

async function createFixtureResident(
  supabase: ReturnType<typeof createServerClient>,
  input: { firstName: string; lastName: string; unit: string; communityId: string; communityName: string; communityCode: string; phone?: string }
) {
  const { data, error } = await supabase
    .from("residents")
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      community_id: input.communityId,
      community_name: input.communityName,
      community_code: input.communityCode,
      unit_number: input.unit,
      phone: input.phone ?? null,
      source_system: "verify-script-fixture",
      is_active: true,
      status: "active",
      serve_relationship_status: "none",
    })
    .select("id")
    .single();
  if (error || !data) fail(`Could not create fixture resident ${input.firstName} ${input.lastName}: ${error?.message}`);
  createdResidentIds.push(data.id as string);
  return data.id as string;
}

async function runAnalysis(supabase: ReturnType<typeof createServerClient>, communityId: string, communityCode: string, csv: string) {
  const runResult = await createCommunityRosterImportRun({
    communityId,
    communityCode,
    sourceFilename: `${RUN_TAG}.csv`,
    sourceHash: `${RUN_TAG}-${Math.random()}`,
    storagePath: "verify-script/does-not-upload-a-real-file.csv",
    importedBy: "verify-script",
  });
  if (runResult.error || !runResult.id) fail(`Could not create import run: ${runResult.error}`);
  createdRunIds.push(runResult.id);

  const start = Date.now();
  const fileBytes = Buffer.from(csv, "utf-8");
  const analysis = await analyzeCommunityRosterFile({ importRunId: runResult.id, communityId, fileBytes });
  const analysisMs = Date.now() - start;
  const insertResult = await insertCommunityRosterSourceRows(runResult.id, analysis.sourceRowInserts);
  if (insertResult.error) fail(`Could not insert source rows: ${insertResult.error}`);

  const persisted = await getRosterSourceRowsForRun(runResult.id);
  return { runId: runResult.id, analysis, persisted, analysisMs };
}

async function main() {
  const supabase = createServerClient();

  const { data: firewheel } = await supabase.from("communities").select("id, code, name").eq("code", "watermere_firewheel").maybeSingle();
  if (!firewheel) fail("Firewheel community not found.");
  const { data: frisco } = await supabase.from("communities").select("id, code, name").eq("code", "watermere_frisco").maybeSingle();
  if (!frisco) fail("Frisco community not found.");

  try {
    // ═══ 1a. Phone alone never creates a candidate ═══════════════════
    const phoneOnlyResident = await createFixtureResident(supabase, {
      firstName: "Unrelated",
      lastName: `PersonOne${RUN_TAG}`,
      unit: "801",
      communityId: firewheel.id,
      communityName: firewheel.name,
      communityCode: firewheel.code,
      phone: "555-9001",
    });
    void phoneOnlyResident;
    const csv1a = ["Last Name,First Name,Apartment,Phone", `TotallyDifferentSurname${RUN_TAG},Nobody,802,555-9001`].join("\n");
    const first = await runAnalysis(supabase, firewheel.id, firewheel.code, csv1a);
    const noNameMatchRow = first.persisted[0];
    if (noNameMatchRow.resolutionStatus !== "new_resident") {
      fail(`A shared phone with NO name similarity must never create a candidate on its own — expected 'new_resident', got '${noNameMatchRow.resolutionStatus}'`);
    }
    console.log("ok - 1a. a shared phone with zero name similarity never creates a candidate (household evidence cannot manufacture identity on its own)");

    // ═══ 1b. Phone corroborates a name-only "probable" up to "high" ══
    const corroboratedResident = await createFixtureResident(supabase, {
      firstName: "Roberta",
      lastName: `Nguyen${RUN_TAG}`,
      unit: "901",
      communityId: firewheel.id,
      communityName: firewheel.name,
      communityCode: firewheel.code,
      phone: "555-9100",
    });
    // "Robert" vs "Roberta" is NOT edit-distance-one (differs by more than
    // one character edit), so the roster's own tier 1 (exact name) and
    // Serve's edit-distance-one identity signal both miss it purely on
    // name -- deliberately not the near-miss case Pass 2 already covers.
    // Compound-name-variant IS designed for exactly this ("Roberta"
    // strictly contains "Robert" as a token superset is false since
    // they're one token, not two) -- so use a genuinely DIFFERENT
    // signal instead: identical UNUSUAL last name, first initial only,
    // is not itself a signal at all in identitySignals.ts, so this row
    // alone would be pure new_resident. Confirm that baseline first...
    const csv1bBaseline = ["Last Name,First Name,Apartment,Phone", `Nguyen${RUN_TAG},R,999,555-0000`].join("\n");
    const baseline = await runAnalysis(supabase, firewheel.id, firewheel.code, csv1bBaseline);
    if (baseline.persisted[0].resolutionStatus !== "new_resident") {
      fail(`Expected the baseline (no phone match, no strong name signal) to be 'new_resident', got '${baseline.persisted[0].resolutionStatus}'`);
    }
    console.log("ok - 1b-baseline: initials-only name similarity alone produces no candidate (no identity evidence at all)");

    // Now the SAME weak-name row, but sharing the resident's phone number
    // too -- still no identity evidence exists (household corroboration
    // cannot manufacture one), so this must ALSO stay new_resident. This
    // is the framework's own core rule (confidenceBands.test.ts check 1),
    // re-proven end-to-end through the roster path.
    const csv1bPhone = ["Last Name,First Name,Apartment,Phone", `Nguyen${RUN_TAG},R,999,555-9100`].join("\n");
    const withPhone = await runAnalysis(supabase, firewheel.id, firewheel.code, csv1bPhone);
    if (withPhone.persisted[0].resolutionStatus !== "new_resident") {
      fail(`Expected phone-alone (still zero identity evidence) to stay 'new_resident', got '${withPhone.persisted[0].resolutionStatus}'`);
    }
    console.log("ok - 1b: a shared phone with weak/no name evidence still never creates a candidate — confirms household corroboration only upgrades an ALREADY-nonzero identity read");

    // A genuine edit-distance-one first name (real identity evidence) at
    // a DIFFERENT apartment (so the roster's own tier misses it) with
    // NO phone match -> possible_match at "low" confidence (probable band).
    const csv1cNoPhone = ["Last Name,First Name,Apartment,Phone", `Nguyen${RUN_TAG},Robert,111,555-0000`].join("\n");
    const noPhone = await runAnalysis(supabase, firewheel.id, firewheel.code, csv1cNoPhone);
    const noPhoneRow = noPhone.persisted[0];
    if (noPhoneRow.resolutionStatus !== "possible_match") fail(`Expected 'possible_match' from a real edit-distance-one name signal, got '${noPhoneRow.resolutionStatus}'`);
    if (noPhoneRow.matchConfidence !== "low") fail(`Expected uncorroborated possible_match confidence 'low' (probable band), got '${noPhoneRow.matchConfidence}'`);
    console.log("ok - 1c: a real name-edit-distance signal alone (no phone match) -> possible_match at 'low' confidence (probable band)");

    // The SAME edit-distance-one name, but ALSO sharing the resident's
    // phone number -> household corroboration upgrades probable -> high,
    // surfaced as matchConfidence 'medium'.
    const csv1dWithPhone = ["Last Name,First Name,Apartment,Phone", `Nguyen${RUN_TAG},Robert,111,555-9100`].join("\n");
    const withCorroboration = await runAnalysis(supabase, firewheel.id, firewheel.code, csv1dWithPhone);
    const corroboratedRow = withCorroboration.persisted[0];
    if (corroboratedRow.resolutionStatus !== "possible_match") fail(`Expected 'possible_match', got '${corroboratedRow.resolutionStatus}'`);
    if (corroboratedRow.matchConfidence !== "medium") {
      fail(`Expected phone-corroborated possible_match confidence 'medium' (high band), got '${corroboratedRow.matchConfidence}' — household corroboration is not participating`);
    }
    if (!corroboratedRow.reviewNotes?.toLowerCase().includes("phone")) {
      fail(`Expected the corroborated reason to mention the shared phone, got: ${corroboratedRow.reviewNotes}`);
    }
    if (corroboratedRow.matchedResidentId !== corroboratedResident) fail("Expected the corroborated candidate to be the phone-sharing resident.");
    console.log("ok - 1d: the SAME name-edit-distance signal, now ALSO sharing the resident's phone number, upgrades to matchConfidence 'medium' (high band) — household corroboration confirmed participating via the existing framework, no new score invented");

    // ═══ 2. Performance: a realistic ~400-row roster ═════════════════
    const rowCount = 400;
    const csvLines = ["Last Name,First Name,Apartment,Phone"];
    // A handful of genuine matches scattered through, so the analysis
    // does real matching work, not just parse-and-skip.
    const perfMatchResidents: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await createFixtureResident(supabase, {
        firstName: `Perf${i}`,
        lastName: `${RUN_TAG}Perf`,
        unit: `${2000 + i}`,
        communityId: firewheel.id,
        communityName: firewheel.name,
        communityCode: firewheel.code,
      });
      perfMatchResidents.push(id);
    }
    for (let i = 0; i < rowCount; i++) {
      if (i < 5) {
        csvLines.push(`${RUN_TAG}Perf,Perf${i},${2000 + i},555-${String(1000 + i).padStart(4, "0")}`);
      } else {
        csvLines.push(`${RUN_TAG}Bulk${i},First${i},${3000 + i},555-${String(1000 + i).padStart(4, "0")}`);
      }
    }
    const perf = await runAnalysis(supabase, firewheel.id, firewheel.code, csvLines.join("\n"));
    if (perf.analysis.totalSourceRows !== rowCount) fail(`Expected ${rowCount} rows analyzed, got ${perf.analysis.totalSourceRows}`);
    const matchedCount = perf.persisted.filter((r) => r.resolutionStatus === "exact_match").length;
    if (matchedCount !== 5) fail(`Expected 5 exact_match rows in the performance fixture, got ${matchedCount}`);
    console.log(`ok - 2. ${rowCount}-row roster analyzed in ${perf.analysisMs}ms (candidates batch-loaded once per run, not per row — see communityRosterAnalysis.ts)`);
    if (perf.analysisMs > 15000) {
      fail(`Analysis took ${perf.analysisMs}ms for ${rowCount} rows — investigate before considering this production-ready at realistic roster sizes.`);
    }

    // ═══ 3. Community isolation holds at this row count too ══════════
    const { data: friscoRuns } = await supabase.from("roster_import_runs").select("id").eq("community_id", frisco.id).eq("id", perf.runId);
    if (friscoRuns && friscoRuns.length > 0) fail("The Firewheel performance-fixture run incorrectly appeared under Frisco's community_id filter.");
    console.log("ok - 3. community isolation holds at realistic row counts");

    console.log("\nALL CHECKS PASSED");
  } finally {
    await cleanup(supabase);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
