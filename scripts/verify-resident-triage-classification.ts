// Live Supabase verification for the structured EP_CLIENT_TRIAGE_CLASSIFIED
// feature: supabase/migrations/20260902350000_create_resident_triage_classifications.sql,
// 20260902360000 and 20260918000000_update_ep_client_triage_classified_description*.sql,
// plus the triage canonical-source-gap repair (initializeMissingTriageClassificationFromAxisCare
// in lib/integrations/axiscare/clientCanonicalApply.ts, Priority 1 investigation 2026-09-17/18).
//
// REQUIRES all three migrations applied first — fails immediately with a
// clear message if resident_triage_classifications isn't queryable.
//
// Disposable synthetic data only: three fixture residents and three fixture
// axiscare_client_canonical_snapshot rows (synthetic AxisCare ids, never
// real ones), created and cleaned up here — never Maria/Karen's real rows.
// Every row this script creates is tagged with a deterministic
// generateTestMarker() value and deleted in a finally block.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-resident-triage-classification.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { getRequirementByCode } from "../lib/data/personRequirements.ts";
import { getClientReadinessEvaluation } from "../lib/clientReadiness/clientReadinessReadiness.ts";
import { syncCurrentTriageClassificationEvidence } from "../lib/clientReadiness/evidence.ts";
import {
  getCurrentResidentTriageClassification,
  getResidentTriageClassificationHistory,
  hasAnyResidentTriageClassification,
  recordResidentTriageClassification,
} from "../lib/data/residentTriageClassifications.ts";
import { buildTriageClassificationDetail } from "../lib/clientReadiness/triageClassificationDetail.ts";
import { initializeMissingTriageClassificationFromAxisCare } from "../lib/integrations/axiscare/clientCanonicalApply.ts";
import { EP_CLIENT_TRIAGE_CLASSIFIED } from "../lib/clientReadiness/constants.ts";

const RUN_MARKER = generateTestMarker("resident-triage-classification-verify");
const ACTOR = RUN_MARKER;
const FIXTURE_AXISCARE_CLIENT_ID = `__SERVE_TEST_AXISCARE_ID__${RUN_MARKER}`;

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const supabase = createServerClient();

  const preflight = await supabase.from("resident_triage_classifications").select("id").limit(1);
  if (preflight.error) {
    console.error(
      "\nresident_triage_classifications is not queryable — migration " +
        "20260902350000_create_resident_triage_classifications.sql has not been applied to this environment yet. " +
        "Apply it, then re-run this script.\n",
      preflight.error.message
    );
    process.exit(1);
  }

  const requirement = await getRequirementByCode(EP_CLIENT_TRIAGE_CLASSIFIED);
  if (!requirement) {
    console.error("EP_CLIENT_TRIAGE_CLASSIFIED requirement not found — is the CLIENT_RECORD_READINESS set seeded?");
    process.exit(1);
  }

  let residentId: string | null = null;
  let snapshotId: string | null = null;
  let residentId2: string | null = null;
  let snapshotId2: string | null = null;
  let residentId3: string | null = null;
  let snapshotId3: string | null = null;

  try {
    // ─── Fixture resident ───────────────────────────────────────────────
    const { data: resident, error: createError } = await supabase
      .from("residents")
      .insert({
        first_name: "TriageFixture",
        last_name: RUN_MARKER,
        source_system: "verify-script-fixture",
        is_active: true,
        status: "active",
      })
      .select("id")
      .single();
    if (createError || !resident) throw new Error(`Could not create fixture resident: ${createError?.message}`);
    residentId = resident.id as string;
    console.log(`ok - fixture resident created: ${residentId}`);

    // ─── Before any recording: missing_evidence, no stray evidence ────
    const before = await getClientReadinessEvaluation(residentId, "active_client", null);
    const beforeItem = before?.requirements.find((r) => r.requirement.requirement_code === EP_CLIENT_TRIAGE_CLASSIFIED);
    check("before recording: EP_CLIENT_TRIAGE_CLASSIFIED is missing_evidence", beforeItem?.status === "missing_evidence", beforeItem);

    // ─── Record P1, effective today ────────────────────────────────────
    const first = await recordResidentTriageClassification({
      residentId,
      levelCode: "P1",
      effectiveDate: daysFromToday(0),
      notes: "First fixture recording",
      actor: ACTOR,
    });
    check("first recording succeeds", !first.error && !!first.classification, first.error);

    const currentAfterFirst = await getCurrentResidentTriageClassification(residentId);
    check("current classification is P1 immediately after recording", currentAfterFirst?.levelCode === "P1", currentAfterFirst);

    // ─── Atomicity: satisfied from the governed table alone, BEFORE any evidence sync ──
    const afterFirstNoEvidence = await getClientReadinessEvaluation(residentId, "active_client", currentAfterFirst);
    const afterFirstNoEvidenceItem = afterFirstNoEvidence?.requirements.find((r) => r.requirement.requirement_code === EP_CLIENT_TRIAGE_CLASSIFIED);
    check(
      "REGRESSION: requirement is compliant from the governed row alone, with zero person_evidence rows written yet",
      afterFirstNoEvidenceItem?.status === "compliant",
      afterFirstNoEvidenceItem
    );
    check(
      "...and no evidence is attached yet (proves this reflects the table, not a stray evidence row)",
      afterFirstNoEvidenceItem?.latestEvidence === null,
      afterFirstNoEvidenceItem?.latestEvidence
    );

    // ─── Now sync evidence, and confirm the audit trail catches up ────
    const synced = await syncCurrentTriageClassificationEvidence({ residentId, requirementId: requirement.id, actor: ACTOR });
    check("evidence sync succeeds and is tied to the classification row", synced.evidence?.external_reference === currentAfterFirst?.id, synced);

    // ─── Record P2 with a LATER effective date -- becomes the new current ──
    const second = await recordResidentTriageClassification({
      residentId,
      levelCode: "P2",
      effectiveDate: daysFromToday(0),
      notes: "Second fixture recording",
      actor: ACTOR,
    });
    check("second recording succeeds", !second.error && !!second.classification, second.error);

    const history = await getResidentTriageClassificationHistory(residentId);
    check("history has exactly 2 rows after two recordings", history.length === 2, history);

    const currentAfterSecond = await getCurrentResidentTriageClassification(residentId);
    check(
      "current classification is now P2 (latest by created_at among same-effective-date rows)",
      currentAfterSecond?.levelCode === "P2",
      currentAfterSecond
    );

    const afterSecond = await getClientReadinessEvaluation(residentId, "active_client", currentAfterSecond);
    const afterSecondItem = afterSecond?.requirements.find((r) => r.requirement.requirement_code === EP_CLIENT_TRIAGE_CLASSIFIED);
    check("requirement reflects the updated (P2) classification, still compliant", afterSecondItem?.status === "compliant", afterSecondItem);

    // ─── Future-dated recording must NOT become current early ─────────
    const future = await recordResidentTriageClassification({
      residentId,
      levelCode: "P3",
      effectiveDate: daysFromToday(30),
      notes: "Future fixture recording -- must not take effect yet",
      actor: ACTOR,
    });
    check("future-dated recording succeeds (it's stored, just not current)", !future.error && !!future.classification, future.error);

    const currentAfterFuture = await getCurrentResidentTriageClassification(residentId);
    check(
      "REGRESSION: a future-dated recording does not become current early -- current is still P2",
      currentAfterFuture?.levelCode === "P2",
      currentAfterFuture
    );

    const historyAfterFuture = await getResidentTriageClassificationHistory(residentId);
    check("the future-dated row is still visible in history (3 total)", historyAfterFuture.length === 3, historyAfterFuture);

    const afterFuture = await getClientReadinessEvaluation(residentId, "active_client", currentAfterFuture);
    const afterFutureItem = afterFuture?.requirements.find((r) => r.requirement.requirement_code === EP_CLIENT_TRIAGE_CLASSIFIED);
    check(
      "REGRESSION: the requirement still reflects P2/Moderate Support (the current classification), not the future P3, and never exposes the raw code",
      (afterFutureItem?.explanation.includes("Moderate Support") ?? false) &&
        !afterFutureItem?.explanation.includes("P2") &&
        !afterFutureItem?.explanation.includes("P3"),
      afterFutureItem
    );

    // ─── AxisCare comparison: mismatch detection (current vocabulary) ──
    const { data: snapshot, error: snapshotError } = await supabase
      .from("axiscare_client_canonical_snapshot")
      .insert({
        axiscare_client_id: FIXTURE_AXISCARE_CLIENT_ID,
        triage_level_description: "Lower Support / Independent",
      })
      .select("id")
      .single();
    if (snapshotError || !snapshot) throw new Error(`Could not create fixture AxisCare snapshot row: ${snapshotError?.message}`);
    snapshotId = snapshot.id as string;

    const mismatchDetail = buildTriageClassificationDetail({
      serveCurrent: currentAfterFuture, // P2
      axiscareRawDescription: "Lower Support / Independent",
    });
    check("a genuine disagreement (Serve P2 vs AxisCare P3) is detected as 'disagree'", mismatchDetail.state === "disagree", mismatchDetail);

    // ─── AxisCare comparison: SUPERSEDED vocabulary still recognized ───
    // (2026-09-18 relabel repair) -- a snapshot frozen on the old
    // "PRIORITY N -- Continuity Need" text must still compare correctly,
    // not read as unrecognized the moment the account was renamed.
    const supersededVocabDetail = buildTriageClassificationDetail({
      serveCurrent: currentAfterFuture, // P2
      axiscareRawDescription: "PRIORITY 2 — MODERATE CONTINUITY NEED",
    });
    check(
      "REGRESSION: a superseded-vocabulary AxisCare value still agrees correctly (Serve P2 == AxisCare P2, old wording)",
      supersededVocabDetail.state === "agree",
      supersededVocabDetail
    );

    // ─── AxisCare comparison: legacy/unrecognized value, never coerced ──
    const legacyDetail = buildTriageClassificationDetail({
      serveCurrent: currentAfterFuture,
      axiscareRawDescription: "Can get out on their own",
    });
    check(
      "an unrecognized/legacy AxisCare value registers as neither a match nor a mismatch",
      legacyDetail.state === "serve_with_unrecognized_axiscare" && legacyDetail.axiscare?.code === null,
      legacyDetail
    );

    // ─── initializeMissingTriageClassificationFromAxisCare: no-op when a ──
    // governed row already exists -- including a FUTURE-DATED one. Reuses
    // residentId, which already has a future-dated P3 row (never current)
    // alongside its current P2 row -- the exact invariant this function
    // must respect (approved 2026-09-18): "any governed row, any effective
    // date" blocks initialization, not merely "no CURRENT row".
    const alreadyOwnedCheck = await hasAnyResidentTriageClassification(residentId);
    check("hasAnyResidentTriageClassification is true for a resident with rows (including a future-dated one)", alreadyOwnedCheck === true, alreadyOwnedCheck);

    const blockedInit = await initializeMissingTriageClassificationFromAxisCare({
      residentId,
      axiscareClientId: FIXTURE_AXISCARE_CLIENT_ID,
      triageRequirementId: requirement.id,
      triageLevelDescription: "Enhanced Support",
      fetchedAt: new Date().toISOString(),
      actor: ACTOR,
    });
    check(
      "REGRESSION: initializeMissingTriageClassificationFromAxisCare no-ops when ANY governed row exists, even though the AxisCare value is recognized",
      blockedInit.status === "skipped_governed_row_exists",
      blockedInit
    );
    const historyUnchangedByBlockedInit = await getResidentTriageClassificationHistory(residentId);
    check("...and no new row was written (history is still exactly 3)", historyUnchangedByBlockedInit.length === 3, historyUnchangedByBlockedInit);

    // ─── initializeMissingTriageClassificationFromAxisCare: initializes ──
    // when zero governed rows have ever existed and the AxisCare value is
    // recognized. A fresh fixture resident, deliberately never touched by
    // recordResidentTriageClassification.
    const { data: resident2, error: createError2 } = await supabase
      .from("residents")
      .insert({ first_name: "TriageInitFixture", last_name: RUN_MARKER, source_system: "verify-script-fixture", is_active: true, status: "active" })
      .select("id")
      .single();
    if (createError2 || !resident2) throw new Error(`Could not create second fixture resident: ${createError2?.message}`);
    residentId2 = resident2.id as string;

    const { data: snapshot2, error: snapshotError2 } = await supabase
      .from("axiscare_client_canonical_snapshot")
      .insert({ axiscare_client_id: `${FIXTURE_AXISCARE_CLIENT_ID}-2`, triage_level_description: "Enhanced Support" })
      .select("id")
      .single();
    if (snapshotError2 || !snapshot2) throw new Error(`Could not create second fixture AxisCare snapshot row: ${snapshotError2?.message}`);
    snapshotId2 = snapshot2.id as string;

    check("hasAnyResidentTriageClassification is false for a never-touched resident", (await hasAnyResidentTriageClassification(residentId2)) === false);

    const init = await initializeMissingTriageClassificationFromAxisCare({
      residentId: residentId2,
      axiscareClientId: `${FIXTURE_AXISCARE_CLIENT_ID}-2`,
      triageRequirementId: requirement.id,
      triageLevelDescription: "Enhanced Support",
      fetchedAt: new Date().toISOString(),
      actor: ACTOR,
    });
    check("REGRESSION: initializeMissingTriageClassificationFromAxisCare initializes when zero governed rows ever existed", init.status === "initialized" && init.levelCode === "P1", init);

    const currentAfterInit = await getCurrentResidentTriageClassification(residentId2);
    check("...and the governed table now reflects P1", currentAfterInit?.levelCode === "P1", currentAfterInit);

    const evidenceAfterInit = await getClientReadinessEvaluation(residentId2, "active_client", currentAfterInit);
    const evidenceAfterInitItem = evidenceAfterInit?.requirements.find((r) => r.requirement.requirement_code === EP_CLIENT_TRIAGE_CLASSIFIED);
    check("...the requirement is compliant, and the evidence mirror was synced (latestEvidence present)", evidenceAfterInitItem?.status === "compliant" && !!evidenceAfterInitItem?.latestEvidence, evidenceAfterInitItem);

    // ─── Idempotency: re-running against the same resident is a safe no-op ──
    const reInit = await initializeMissingTriageClassificationFromAxisCare({
      residentId: residentId2,
      axiscareClientId: `${FIXTURE_AXISCARE_CLIENT_ID}-2`,
      triageRequirementId: requirement.id,
      triageLevelDescription: "Enhanced Support",
      fetchedAt: new Date().toISOString(),
      actor: ACTOR,
    });
    check("REGRESSION: re-running initializeMissingTriageClassificationFromAxisCare against an already-initialized resident is a safe no-op", reInit.status === "skipped_governed_row_exists", reInit);

    // ─── initializeMissingTriageClassificationFromAxisCare: unrecognized ──
    // AxisCare value -- zero governed rows, but the description matches
    // neither vocabulary. Must no-op, never guess.
    const { data: resident3, error: createError3 } = await supabase
      .from("residents")
      .insert({ first_name: "TriageUnrecognizedFixture", last_name: RUN_MARKER, source_system: "verify-script-fixture", is_active: true, status: "active" })
      .select("id")
      .single();
    if (createError3 || !resident3) throw new Error(`Could not create third fixture resident: ${createError3?.message}`);
    residentId3 = resident3.id as string;

    const { data: snapshot3, error: snapshotError3 } = await supabase
      .from("axiscare_client_canonical_snapshot")
      .insert({ axiscare_client_id: `${FIXTURE_AXISCARE_CLIENT_ID}-3`, triage_level_description: "Can get out on their own" })
      .select("id")
      .single();
    if (snapshotError3 || !snapshot3) throw new Error(`Could not create third fixture AxisCare snapshot row: ${snapshotError3?.message}`);
    snapshotId3 = snapshot3.id as string;

    const unrecognizedInit = await initializeMissingTriageClassificationFromAxisCare({
      residentId: residentId3,
      axiscareClientId: `${FIXTURE_AXISCARE_CLIENT_ID}-3`,
      triageRequirementId: requirement.id,
      triageLevelDescription: "Can get out on their own",
      fetchedAt: new Date().toISOString(),
      actor: ACTOR,
    });
    check(
      "REGRESSION: initializeMissingTriageClassificationFromAxisCare never guesses at an unrecognized AxisCare value",
      unrecognizedInit.status === "skipped_unrecognized_value",
      unrecognizedInit
    );
    check("...and zero governed rows were created", (await hasAnyResidentTriageClassification(residentId3)) === false);

    console.log("\nALL CHECKS COMPLETE");
  } finally {
    console.log("\nCleaning up fixture data...");
    if (snapshotId) {
      await supabase.from("axiscare_client_canonical_snapshot").delete().eq("id", snapshotId);
    }
    if (snapshotId2) {
      await supabase.from("axiscare_client_canonical_snapshot").delete().eq("id", snapshotId2);
    }
    if (snapshotId3) {
      await supabase.from("axiscare_client_canonical_snapshot").delete().eq("id", snapshotId3);
    }
    if (residentId) {
      await supabase.from("resident_triage_classifications").delete().eq("resident_id", residentId);
      await supabase.from("person_evidence").delete().eq("subject_type", "resident").eq("subject_id", residentId);
      await supabase.from("residents").delete().eq("id", residentId);
    }
    if (residentId2) {
      await supabase.from("resident_triage_classifications").delete().eq("resident_id", residentId2);
      await supabase.from("person_evidence").delete().eq("subject_type", "resident").eq("subject_id", residentId2);
      await supabase.from("residents").delete().eq("id", residentId2);
    }
    if (residentId3) {
      await supabase.from("resident_triage_classifications").delete().eq("resident_id", residentId3);
      await supabase.from("person_evidence").delete().eq("subject_type", "resident").eq("subject_id", residentId3);
      await supabase.from("residents").delete().eq("id", residentId3);
    }
    console.log("ok - fixture snapshots, classifications, evidence, and residents deleted");
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
