// Live verification for the Category A semantic graft: the broader
// Client Readiness population applicability gate
// (isOutsideClientReadinessPopulation in clientReadinessReadiness.ts),
// ported from the preserved sibling implementation (commit 6500be6 on
// feature/audit-readiness-v0.1) into getClientReadinessEvaluation().
//
// Disposable synthetic data only: four fixture residents (one per
// relevant relationship bucket), no AxisCare involvement, cleaned up in
// a finally block.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-client-readiness-population-gate.ts
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { getClientReadinessEvaluation } from "../lib/clientReadiness/clientReadinessReadiness.ts";
import { CR_ASSESSMENT_CURRENT, CR_CLIENT_PROFILE_ON_FILE, CR_DISCHARGE_SUMMARY_ON_FILE, EP_CLIENT_TRIAGE_CLASSIFIED } from "../lib/clientReadiness/constants.ts";
import type { ServeRelationship } from "../lib/residents/serveRelationshipProjection.ts";

const RUN_MARKER = generateTestMarker("client-readiness-population-gate-verify");

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

async function createFixtureResident(supabase: ReturnType<typeof createServerClient>, label: string): Promise<string> {
  const { data, error } = await supabase
    .from("residents")
    .insert({ first_name: label, last_name: RUN_MARKER, source_system: "verify-script-fixture", is_active: true, status: "active" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not create fixture resident (${label}): ${error?.message}`);
  return data.id as string;
}

async function main() {
  const supabase = createServerClient();
  const createdResidentIds: string[] = [];

  try {
    // ─── prospect (Maria Matos bucket) ──────────────────────────────────
    const prospectId = await createFixtureResident(supabase, "ProspectFixture");
    createdResidentIds.push(prospectId);
    const prospectEval = await getClientReadinessEvaluation(prospectId, "prospect" as ServeRelationship);
    const prospectAssessment = prospectEval?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    const prospectProfile = prospectEval?.requirements.find((r) => r.requirement.requirement_code === CR_CLIENT_PROFILE_ON_FILE);
    const prospectDischarge = prospectEval?.requirements.find((r) => r.requirement.requirement_code === CR_DISCHARGE_SUMMARY_ON_FILE);
    check("REGRESSION (Maria Matos bucket): prospect Assessment is not_applicable, not missing_evidence", prospectAssessment?.status === "not_applicable", prospectAssessment);
    check("prospect Client Profile is not_applicable", prospectProfile?.status === "not_applicable", prospectProfile);
    check("prospect Discharge stays not_applicable (its own, unrelated rule -- never confused with the population gate)", prospectDischarge?.status === "not_applicable", prospectDischarge);
    check(
      "prospect: no requirement anywhere reports missing_evidence -- no wall of red cards",
      (prospectEval?.requirements ?? []).every((r) => r.status !== "missing_evidence"),
      prospectEval?.requirements.map((r) => ({ code: r.requirement.requirement_code, status: r.status }))
    );

    // ─── no_current_relationship ────────────────────────────────────────
    const noneId = await createFixtureResident(supabase, "NoRelationshipFixture");
    createdResidentIds.push(noneId);
    const noneEval = await getClientReadinessEvaluation(noneId, "no_current_relationship" as ServeRelationship);
    const noneAssessment = noneEval?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    check("no_current_relationship: Assessment is not_applicable", noneAssessment?.status === "not_applicable", noneAssessment);

    // ─── needs_review (Karen Mabry bucket) ──────────────────────────────
    const needsReviewId = await createFixtureResident(supabase, "NeedsReviewFixture");
    createdResidentIds.push(needsReviewId);
    const needsReviewEval = await getClientReadinessEvaluation(needsReviewId, "needs_review" as ServeRelationship);
    const needsReviewAssessment = needsReviewEval?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    const needsReviewTriage = needsReviewEval?.requirements.find((r) => r.requirement.requirement_code === EP_CLIENT_TRIAGE_CLASSIFIED);
    check("REGRESSION (Karen Mabry bucket): needs_review Assessment is not_applicable, not missing_evidence", needsReviewAssessment?.status === "not_applicable", needsReviewAssessment);
    check("needs_review Triage (bespoke, but still a 'standard' requirement conceptually) is also not_applicable", needsReviewTriage?.status === "not_applicable", needsReviewTriage);

    // ─── active_client -- full evaluation, unaffected ───────────────────
    const activeId = await createFixtureResident(supabase, "ActiveClientFixture");
    createdResidentIds.push(activeId);
    const activeEval = await getClientReadinessEvaluation(activeId, "active_client" as ServeRelationship);
    const activeAssessment = activeEval?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    check(
      "REGRESSION: active_client still receives the FULL evaluation -- Assessment reports missing_evidence, not silently suppressed",
      activeAssessment?.status === "missing_evidence",
      activeAssessment
    );
    check(
      "active_client: the population-gate explanation never appears anywhere in its results",
      (activeEval?.requirements ?? []).every((r) => !r.explanation.includes("no active Serve relationship")),
      activeEval?.requirements.map((r) => r.explanation)
    );

    // ─── inactive_client -- NOT swallowed by the broad gate ─────────────
    const inactiveId = await createFixtureResident(supabase, "InactiveClientFixture");
    createdResidentIds.push(inactiveId);
    const inactiveEval = await getClientReadinessEvaluation(inactiveId, "inactive_client" as ServeRelationship);
    const inactiveAssessment = inactiveEval?.requirements.find((r) => r.requirement.requirement_code === CR_ASSESSMENT_CURRENT);
    const inactiveDischarge = inactiveEval?.requirements.find((r) => r.requirement.requirement_code === CR_DISCHARGE_SUMMARY_ON_FILE);
    check(
      "REGRESSION: inactive_client's standard requirements are NOT swallowed by the broad gate -- Assessment still reports missing_evidence (real historical record)",
      inactiveAssessment?.status === "missing_evidence",
      inactiveAssessment
    );
    check(
      "inactive_client's OWN Discharge/Transfer rule now correctly applies (missing_evidence, no summary on file) -- continues to behave under its own applicability logic",
      inactiveDischarge?.status === "missing_evidence",
      inactiveDischarge
    );

    // ─── denominator correctness ─────────────────────────────────────────
    const prospectApplicable = (prospectEval?.requirements ?? []).filter((r) => r.status !== "not_applicable");
    check("prospect: zero applicable requirements count toward readiness (every one is not_applicable)", prospectApplicable.length === 0, prospectApplicable);
    check("prospect: ready is false (no applicable requirements -> never trivially 'ready')", prospectEval?.ready === false);

    console.log("\nALL CHECKS COMPLETE");
  } finally {
    console.log("\nCleaning up fixture data...");
    if (createdResidentIds.length > 0) {
      await supabase.from("person_evidence").delete().in("subject_id", createdResidentIds);
      await supabase.from("residents").delete().in("id", createdResidentIds);
    }
    console.log("ok - fixture residents deleted");
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
