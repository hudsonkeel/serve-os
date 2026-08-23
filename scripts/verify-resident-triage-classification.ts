// Live Supabase verification for the structured EP_CLIENT_TRIAGE_CLASSIFIED
// feature: supabase/migrations/20260902350000_create_resident_triage_classifications.sql
// and 20260902360000_update_ep_client_triage_classified_description.sql.
//
// REQUIRES both migrations applied first — fails immediately with a clear
// message if resident_triage_classifications isn't queryable.
//
// Disposable synthetic data only: one fixture resident (created and
// cleaned up here, never Maria/Karen's real rows) and one fixture
// axiscare_client_canonical_snapshot row (a synthetic AxisCare id, never a
// real one). Every row this script creates is tagged with a deterministic
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
  recordResidentTriageClassification,
} from "../lib/data/residentTriageClassifications.ts";
import { buildTriageClassificationDetail } from "../lib/clientReadiness/triageClassificationDetail.ts";
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
      "REGRESSION: the requirement still reflects P2 (the current classification), not the future P3",
      afterFutureItem?.explanation.includes("P2") ?? false,
      afterFutureItem
    );

    // ─── AxisCare comparison: mismatch detection ───────────────────────
    const { data: snapshot, error: snapshotError } = await supabase
      .from("axiscare_client_canonical_snapshot")
      .insert({
        axiscare_client_id: FIXTURE_AXISCARE_CLIENT_ID,
        triage_level_description: "PRIORITY 3 — LOW CONTINUITY NEED",
      })
      .select("id")
      .single();
    if (snapshotError || !snapshot) throw new Error(`Could not create fixture AxisCare snapshot row: ${snapshotError?.message}`);
    snapshotId = snapshot.id as string;

    const mismatchDetail = buildTriageClassificationDetail({
      serveCurrent: currentAfterFuture, // P2
      axiscareRawDescription: "PRIORITY 3 — LOW CONTINUITY NEED",
    });
    check("a genuine disagreement (Serve P2 vs AxisCare P3) is detected as 'disagree'", mismatchDetail.state === "disagree", mismatchDetail);

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

    console.log("\nALL CHECKS COMPLETE");
  } finally {
    console.log("\nCleaning up fixture data...");
    if (snapshotId) {
      await supabase.from("axiscare_client_canonical_snapshot").delete().eq("id", snapshotId);
    }
    if (residentId) {
      await supabase.from("resident_triage_classifications").delete().eq("resident_id", residentId);
      await supabase.from("person_evidence").delete().eq("subject_type", "resident").eq("subject_id", residentId);
      await supabase.from("residents").delete().eq("id", residentId);
    }
    console.log("ok - fixture snapshot, classifications, evidence, and resident deleted");
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
