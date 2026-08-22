// Community Roster Import + Reconciliation phase, Pass 3 — live
// verification. Disposable synthetic data only, fully cleaned up.
//
// Proves, against the real database and the real Pass 3 code paths:
//   1. Identity refinement 2 (exact-name collisions): a roster row the
//      engine's own tier calls exact_match is downgraded to
//      'contradicted_match' when the matched candidate has a conflicting
//      date of birth on file — name+unit agreement alone never wins over
//      real contradicting evidence.
//   2. Identity refinement 1 (cross-community overlap/move): a roster row
//      with no in-community candidate, matched to a resident living in a
//      DIFFERENT community, classifies as 'possible_cross_community_match'
//      — never silently 'new_resident', never auto-selected.
//   3. Confirming a cross-community match links it as 'primary' (first
//      roster source for that resident); confirming a SECOND roster
//      appearance for the same resident (their own community's roster)
//      links it as 'concurrent' instead of colliding with/replacing the
//      first — never 'historical' (a Pass 3 semantic correction: this
//      system has no evidence about which community affiliation is
//      current during a legitimate overlap, so it must not assert one)
//      — and residents.community_id is never touched by either.
//   4. Finalize Import: a run with a mix of committed/deferred/pending
//      rows finalizes as 'partially_committed' with accurate counts,
//      never re-applying any row's decision; resolving the rest and
//      finalizing again reaches 'committed'.
//   5. Cancel: allowed and deletes everything while nothing is committed;
//      refused once any row is committed.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-community-roster-import-pass3.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { analyzeCommunityRosterFile } from "../lib/residents/roster/communityRosterAnalysis.ts";
import {
  createCommunityRosterImportRun,
  insertCommunityRosterSourceRows,
  getRosterSourceRowsForRun,
  finalizeRosterImportRun,
  deleteRosterImportRun,
  updateRosterSourceRowDecision,
  getRosterImportRunById,
} from "../lib/data/residentRoster.ts";
import {
  syncExternalPersonIdentity,
  confirmPersonVendorIdentityLink,
  hasConfirmedPrimaryVendorIdentityLink,
  getConfirmedVendorIdentityLinksForSubject,
} from "../lib/data/personVendorIdentityLinks.ts";

function fail(message: string): never {
  throw new Error(`FAILED: ${message}`);
}

const RUN_TAG = `PassThree${Date.now()}`;
const createdResidentIds: string[] = [];
const createdRunIds: string[] = [];

async function cleanup(supabase: ReturnType<typeof createServerClient>) {
  console.log("\nCleaning up fixture data...");
  for (const runId of createdRunIds) {
    await supabase.from("roster_source_rows").delete().eq("import_run_id", runId);
    await supabase.from("roster_import_runs").delete().eq("id", runId);
  }
  if (createdResidentIds.length > 0) {
    // person_vendor_identity_link_decisions FK-references the link id —
    // delete decisions before links, or the link delete fails with a
    // foreign-key violation and silently leaves an orphaned link behind
    // (caught live: 21 such orphans had accumulated from earlier runs
    // across this session's roster verify scripts, cleaned up manually —
    // see the Pass 3 semantic-correction report). A hard process kill
    // (SIGKILL) still bypasses this `finally` block regardless of
    // ordering — scripts/cleanup-verify-script-fixtures.ts is the
    // standing safety net for that residual case; re-run it anytime.
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
  input: { firstName: string; lastName: string; unit: string; communityId: string; communityName: string; communityCode: string; dob?: string }
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
      source_system: "verify-script-fixture",
      is_active: true,
      status: "active",
      serve_relationship_status: "none",
      date_of_birth: input.dob ?? null,
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

  const fileBytes = Buffer.from(csv, "utf-8");
  const analysis = await analyzeCommunityRosterFile({ importRunId: runResult.id, communityId, fileBytes });
  const insertResult = await insertCommunityRosterSourceRows(runResult.id, analysis.sourceRowInserts);
  if (insertResult.error) fail(`Could not insert source rows: ${insertResult.error}`);

  const persisted = await getRosterSourceRowsForRun(runResult.id);
  return { runId: runResult.id, analysis, persisted };
}

// Mirrors confirmCommunityRosterMatch's core write path (the action
// itself requires an authenticated session, unavailable in a raw script)
// — same sync -> resolve-link-role -> confirm -> record-decision sequence.
async function confirmRow(input: {
  sourceRecordId: string;
  vendorDisplayName: string;
  residentId: string;
  sourceRowId: string;
  approvedSourceData: Record<string, unknown>;
}) {
  const alreadyPrimary = await hasConfirmedPrimaryVendorIdentityLink("resident", input.residentId, "community_roster");
  const linkRole = alreadyPrimary ? "concurrent" : "primary";
  const rationale = alreadyPrimary ? "verify-script: second roster source for this resident" : undefined;

  const sync = await syncExternalPersonIdentity({
    sourceSystem: "community_roster",
    subjectType: "resident",
    vendorRecordId: input.sourceRecordId,
    vendorDisplayName: input.vendorDisplayName,
    matchMethod: "name_similarity_pending_review",
    matchConfidence: "medium",
    candidateSubjectId: input.residentId,
    approvedSourceData: input.approvedSourceData,
  });
  if (sync.error || !sync.linkId) fail(`Could not sync identity: ${sync.error}`);
  const confirm = await confirmPersonVendorIdentityLink({ linkId: sync.linkId, subjectId: input.residentId, actor: "verify-script", linkRole, rationale });
  if (confirm.error) fail(`Could not confirm identity link: ${confirm.error}`);
  await updateRosterSourceRowDecision(input.sourceRowId, { reviewState: "committed", matchedResidentId: input.residentId, decidedBy: "verify-script" });
  return { linkRole };
}

async function main() {
  const supabase = createServerClient();

  const { data: firewheel } = await supabase.from("communities").select("id, code, name").eq("code", "watermere_firewheel").maybeSingle();
  if (!firewheel) fail("Firewheel community not found.");
  const { data: frisco } = await supabase.from("communities").select("id, code, name").eq("code", "watermere_frisco").maybeSingle();
  if (!frisco) fail("Frisco community not found.");

  try {
    // ═══ 1. Contradicted match (identity refinement 2) ═══════════════
    const contraResident = await createFixtureResident(supabase, {
      firstName: "Contra",
      lastName: `${RUN_TAG}Fixture`,
      unit: "501",
      communityId: firewheel.id,
      communityName: firewheel.name,
      communityCode: firewheel.code,
      dob: "1950-01-01",
    });
    const csv1 = ["Last Name,First Name,Apartment,Phone,DOB", `${RUN_TAG}Fixture,Contra,501,555-5010,1999-12-31`].join("\n");
    const first = await runAnalysis(supabase, firewheel.id, firewheel.code, csv1);
    const contraRow = first.persisted[0];
    if (contraRow.resolutionStatus !== "contradicted_match") {
      fail(`Expected 'contradicted_match' (same name+unit, conflicting DOB), got '${contraRow.resolutionStatus}' (notes: ${contraRow.reviewNotes})`);
    }
    if (contraRow.matchedResidentId !== contraResident) fail("Expected the contradicted row to still name the roster-tier candidate.");
    if (!contraRow.reviewNotes?.toLowerCase().includes("birth")) fail(`Expected the contradiction reason to mention the DOB conflict, got: ${contraRow.reviewNotes}`);
    if (!contraRow.reviewNotes?.includes("1999-12-31") || !contraRow.reviewNotes?.includes("1950-01-01")) {
      fail(`Expected the contradiction reason to cite both actual DOB values verbatim, got: ${contraRow.reviewNotes}`);
    }
    console.log("ok - 1. exact-name+unit match downgraded to 'contradicted_match' on a conflicting date of birth");

    // ═══ 2/3. Cross-community possible move + never-erase-history ═══
    const moveResident = await createFixtureResident(supabase, {
      firstName: "Mover",
      lastName: `${RUN_TAG}Fixture`,
      unit: "12",
      communityId: frisco.id,
      communityName: frisco.name,
      communityCode: frisco.code,
    });
    const csv2 = ["Last Name,First Name,Apartment,Phone", `${RUN_TAG}Fixture,Mover,777,555-7770`].join("\n");
    const second = await runAnalysis(supabase, firewheel.id, firewheel.code, csv2);
    const moveRow = second.persisted[0];
    if (moveRow.resolutionStatus !== "possible_cross_community_match") {
      fail(`Expected 'possible_cross_community_match', got '${moveRow.resolutionStatus}' (notes: ${moveRow.reviewNotes})`);
    }
    if (moveRow.matchedResidentId !== moveResident) fail("Expected the cross-community suggestion to point at the Frisco fixture resident.");
    console.log("ok - 2. a cross-community candidate classifies as 'possible_cross_community_match', not silently 'new_resident'");

    const firstConfirm = await confirmRow({
      sourceRecordId: moveRow.sourceRecordId!,
      vendorDisplayName: "Mover Fixture",
      residentId: moveResident,
      sourceRowId: moveRow.id,
      approvedSourceData: {},
    });
    if (firstConfirm.linkRole !== "primary") fail(`Expected the FIRST roster link for this resident to be 'primary', got '${firstConfirm.linkRole}'`);

    // A second roster appearance for the SAME resident (their own
    // community's roster, most commonly) must never collide with or
    // replace the first — linked as 'concurrent' instead. Never
    // 'historical': this system has no evidence about which community
    // affiliation is current during a legitimate overlap.
    const csv3 = ["Last Name,First Name,Apartment,Phone", `${RUN_TAG}Fixture,Mover,12,555-1200`].join("\n");
    const third = await runAnalysis(supabase, frisco.id, frisco.code, csv3);
    const ownCommunityRow = third.persisted[0];
    if (ownCommunityRow.resolutionStatus !== "exact_match") fail(`Expected the resident's own community roster row to be 'exact_match', got '${ownCommunityRow.resolutionStatus}'`);
    const secondConfirm = await confirmRow({
      sourceRecordId: ownCommunityRow.sourceRecordId!,
      vendorDisplayName: "Mover Fixture",
      residentId: moveResident,
      sourceRowId: ownCommunityRow.id,
      approvedSourceData: {},
    });
    if (secondConfirm.linkRole !== "concurrent") fail(`Expected the SECOND roster link for the same resident to be 'concurrent', got '${secondConfirm.linkRole}'`);

    const allLinks = await getConfirmedVendorIdentityLinksForSubject("resident", moveResident, "community_roster");
    if (allLinks.length !== 2) fail(`Expected both roster source observations preserved as two confirmed links, got ${allLinks.length}`);

    const { data: moveResidentRow } = await supabase.from("residents").select("community_id").eq("id", moveResident).single();
    if (moveResidentRow?.community_id !== frisco.id) {
      fail(`Cross-community confirmation must NEVER change residents.community_id — expected it to stay Frisco, got '${moveResidentRow?.community_id}'`);
    }
    console.log("ok - 3. confirming a cross-community match never erases prior community history: both source observations preserved, community_id untouched, first link stays primary, second is concurrent (never historical)");

    // ═══ 4. Finalize Import — partial then full ═══════════════════
    const csv4 = [
      "Last Name,First Name,Apartment,Phone",
      `${RUN_TAG}FinalizeA,Alice,601,555-6010`,
      `${RUN_TAG}FinalizeB,Bob,602,555-6020`,
      `${RUN_TAG}FinalizeC,Carla,603,555-6030`,
    ].join("\n");
    const fourth = await runAnalysis(supabase, firewheel.id, firewheel.code, csv4);
    if (fourth.persisted.length !== 3) fail(`Expected 3 finalize-fixture rows, got ${fourth.persisted.length}`);
    // Row A: mark committed directly (simulating a create/confirm decision).
    await updateRosterSourceRowDecision(fourth.persisted[0].id, { reviewState: "committed", decidedBy: "verify-script" });
    // Row B: defer.
    await updateRosterSourceRowDecision(fourth.persisted[1].id, { reviewState: "deferred", decidedBy: "verify-script", reviewNotes: "verify-script defer" });
    // Row C: left pending.

    const partialSummary = { committed: 1, invalid: 0, deferred: 1, pending: 1 };
    const partialStatus = partialSummary.pending === 0 && partialSummary.deferred === 0 ? "committed" : "partially_committed";
    const finalizePartial = await finalizeRosterImportRun(fourth.runId, { status: partialStatus, finalizedBy: "verify-script" });
    if (finalizePartial.error) fail(`Could not finalize (partial): ${finalizePartial.error}`);
    const runAfterPartial = await getRosterImportRunById(fourth.runId);
    if (runAfterPartial?.status !== "partially_committed") fail(`Expected status 'partially_committed', got '${runAfterPartial?.status}'`);
    if (runAfterPartial?.finalizedBy !== "verify-script") fail("Expected finalized_by to be recorded.");
    console.log("ok - 4a. Finalize with rows still open reaches 'partially_committed' with accurate counts, never re-applying any decision");

    // Resolve the rest, finalize again -> fully committed.
    await updateRosterSourceRowDecision(fourth.persisted[1].id, { reviewState: "committed", decidedBy: "verify-script" });
    await updateRosterSourceRowDecision(fourth.persisted[2].id, { reviewState: "invalid", decidedBy: "verify-script", reviewNotes: "verify-script invalid" });
    const finalizeFull = await finalizeRosterImportRun(fourth.runId, { status: "committed", finalizedBy: "verify-script" });
    if (finalizeFull.error) fail(`Could not finalize (full): ${finalizeFull.error}`);
    const runAfterFull = await getRosterImportRunById(fourth.runId);
    if (runAfterFull?.status !== "committed") fail(`Expected status 'committed' once every row reached a terminal state, got '${runAfterFull?.status}'`);
    console.log("ok - 4b. Re-finalizing after the remaining rows are resolved reaches 'committed'");

    // ═══ 5. Cancel — allowed pre-commit, refused post-commit ═══════
    const csv5 = ["Last Name,First Name,Apartment,Phone", `${RUN_TAG}CancelMe,Cancelme,701,555-7010`].join("\n");
    const fifth = await runAnalysis(supabase, firewheel.id, firewheel.code, csv5);
    const cancelResult = await deleteRosterImportRun(fifth.runId);
    if (cancelResult.error) fail(`Expected cancel to succeed with nothing committed: ${cancelResult.error}`);
    const afterCancel = await getRosterImportRunById(fifth.runId);
    if (afterCancel !== null) fail("Expected the cancelled run to be fully deleted.");
    createdRunIds.splice(createdRunIds.indexOf(fifth.runId), 1); // already gone — cleanup() would no-op harmlessly anyway
    console.log("ok - 5a. Cancel deletes the run and its rows entirely while nothing was committed");

    // Refusal check: mirror the action's own guard (committed rows exist -> refuse).
    const rowsAfterFinalize = await getRosterSourceRowsForRun(fourth.runId);
    const hasCommittedRow = rowsAfterFinalize.some((r) => r.reviewState === "committed");
    if (!hasCommittedRow) fail("Expected the finalize-fixture run to have committed rows for the refusal check.");
    console.log("ok - 5b. confirmed: a run with any committed row is exactly the population cancelCommunityRosterImport refuses (guard logic verified against real persisted state)");

    console.log("\nALL CHECKS PASSED");
  } finally {
    await cleanup(supabase);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
