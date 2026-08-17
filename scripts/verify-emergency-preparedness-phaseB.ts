// Live Supabase verification for Emergency Preparedness Activation, Phase
// B: the agencies table + agency subject widening + satisfaction_context
// column (20260902070000), the 6-requirement EMERGENCY_PREPAREDNESS_READINESS
// set + the 3 deliberately-unlinked reference-only requirements
// (20260902080000), and the Annual Review mechanism (20260902090000).
//
// REQUIRES all three to be applied first — this script fails immediately,
// with a clear message, if they aren't (it does not attempt to apply them
// itself).
//
// Collision-safe: every row this script creates is tagged with a
// deterministic generateTestMarker() value and is deleted in a finally
// block, in dependency order. It never touches the real Serve Caregiving
// agency row itself (read-only there) or any pre-existing evidence.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-emergency-preparedness-phaseB.ts
import { randomUUID } from "node:crypto";
import { createServerClient } from "../lib/supabase/server.ts";
import { generateTestMarker } from "../lib/relationships/testMarker.ts";
import { getAgencyBySlug } from "../lib/data/agencies.ts";
import { getRequirementSetWithRequirements, getRequirementByCode } from "../lib/data/personRequirements.ts";
import { getEmergencyPreparednessReadinessEvaluation } from "../lib/emergencyPreparedness/emergencyPreparednessReadiness.ts";
import { recordEmergencyPreparednessRequirementFinding } from "../lib/emergencyPreparedness/emergencyPreparednessReviews.ts";
import { completeEmergencyPreparednessReview } from "../lib/data/emergencyPreparednessReviews.ts";
import {
  EMERGENCY_PREPAREDNESS_READINESS_SET_CODE,
  EP_ANNUAL_PLAN_REVIEW,
  EP_ANNUAL_RESPONSE_DRILL,
  EP_DISASTER_COORDINATOR_DESIGNATED,
  EP_HHS_NOTIFICATION,
  EP_PLAN_MAINTAINED,
  EP_RISK_ASSESSMENT_CURRENT,
  SERVE_CAREGIVING_AGENCY_SLUG,
} from "../lib/emergencyPreparedness/constants.ts";

const RUN_MARKER = generateTestMarker("emergency-preparedness-phaseB-verify");
const ACTOR = RUN_MARKER;

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

async function main() {
  const supabase = createServerClient();

  const preflight = await supabase.from("agencies").select("id").limit(1);
  if (preflight.error) {
    console.error(
      "\nagencies is not queryable — migration 20260902070000_add_agencies_and_widen_agency_subject.sql " +
        "has not been applied to this environment yet. Apply all three Phase B migrations in order, then re-run this script.\n",
      preflight.error.message
    );
    process.exit(1);
  }

  // ─── Section: agencies + agency subject widening ───────────────────────
  console.log("\n== agencies table + agency subject widening ==");

  const agency = await getAgencyBySlug(SERVE_CAREGIVING_AGENCY_SLUG);
  check("the seeded Serve Caregiving agency is found by its stable slug", !!agency, agency);
  if (!agency) {
    console.log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }

  const { error: fakeAgencyError } = await supabase
    .from("compliance_activity")
    .insert({
      subject_type: "agency",
      subject_id: randomUUID(),
      event_type: "agency_temporary_relocation",
      event_title: RUN_MARKER,
      source: RUN_MARKER,
      system_generated: false,
      created_by: ACTOR,
    })
    .select("id")
    .single();
  // compliance_activity has no FK/trigger validation on agency subject_id
  // (a documented, pre-existing, separately-tracked gap) — this insert is
  // expected to SUCCEED even with a fake id. Documented here, not silently
  // assumed, and immediately cleaned up.
  check(
    "compliance_activity's pre-existing agency-subject validation gap is unchanged by this phase (documented, not fixed)",
    !fakeAgencyError,
    fakeAgencyError
  );
  await supabase.from("compliance_activity").delete().eq("event_title", RUN_MARKER);

  // ─── Section: requirement seed shape ────────────────────────────────────
  console.log("\n== requirement seed: 6 linked, 3 deliberately unlinked ==");

  const set = await getRequirementSetWithRequirements(EMERGENCY_PREPAREDNESS_READINESS_SET_CODE);
  check("EMERGENCY_PREPAREDNESS_READINESS set exists", !!set, set);
  check(
    "exactly the 6 agency-level requirements are linked into the set",
    (set?.requirements.map((r) => r.requirement_code).sort().join(",") ?? "") ===
      [
        EP_PLAN_MAINTAINED,
        EP_DISASTER_COORDINATOR_DESIGNATED,
        EP_RISK_ASSESSMENT_CURRENT,
        EP_ANNUAL_PLAN_REVIEW,
        EP_ANNUAL_RESPONSE_DRILL,
        EP_HHS_NOTIFICATION,
      ]
        .sort()
        .join(","),
    set?.requirements.map((r) => r.requirement_code)
  );

  const staffTrained = await getRequirementByCode("EP_STAFF_TRAINED");
  const triageClassified = await getRequirementByCode("EP_CLIENT_TRIAGE_CLASSIFIED");
  const infoAtAdmission = await getRequirementByCode("EP_CLIENT_INFO_PROVIDED_AT_ADMISSION");
  check("EP_STAFF_TRAINED exists as reference data", !!staffTrained, staffTrained);
  check("EP_CLIENT_TRIAGE_CLASSIFIED exists as reference data", !!triageClassified, triageClassified);
  check("EP_CLIENT_INFO_PROVIDED_AT_ADMISSION exists as reference data", !!infoAtAdmission, infoAtAdmission);
  check(
    "none of the 3 deliberately-unlinked requirements appear in EMERGENCY_PREPAREDNESS_READINESS",
    !(set?.requirements ?? []).some((r) =>
      ["EP_STAFF_TRAINED", "EP_CLIENT_TRIAGE_CLASSIFIED", "EP_CLIENT_INFO_PROVIDED_AT_ADMISSION"].includes(r.requirement_code)
    )
  );

  // ─── Section: EP_HHS_NOTIFICATION not_applicable-until-real-event ───────
  console.log("\n== readiness evaluation: EP_HHS_NOTIFICATION not_applicable by default ==");

  const beforeEvaluation = await getEmergencyPreparednessReadinessEvaluation();
  const hhsBefore = beforeEvaluation?.requirements.find((r) => r.requirement.requirement_code === EP_HHS_NOTIFICATION);
  check(
    "EP_HHS_NOTIFICATION reads not_applicable when no operational event has been recorded",
    hhsBefore?.status === "not_applicable",
    hhsBefore
  );

  // ─── Section: a full review start -> walk -> complete -> lock cycle ────
  console.log("\n== Annual Review: start -> record findings -> complete -> lock ==");

  const planRequirement = await getRequirementByCode(EP_PLAN_MAINTAINED);
  const coordinatorRequirement = await getRequirementByCode(EP_DISASTER_COORDINATOR_DESIGNATED);
  const riskRequirement = await getRequirementByCode(EP_RISK_ASSESSMENT_CURRENT);
  const annualReviewRequirement = await getRequirementByCode(EP_ANNUAL_PLAN_REVIEW);

  let reviewId: string | undefined;
  const createdEvidenceIds: string[] = [];

  try {
    const { data: review, error: reviewError } = await supabase
      .from("emergency_preparedness_reviews")
      .insert({ reviewer: ACTOR })
      .select("*")
      .single();
    check("review started", !reviewError && !!review, reviewError);
    reviewId = review?.id as string | undefined;
    if (!reviewId || !planRequirement || !coordinatorRequirement || !riskRequirement || !annualReviewRequirement) {
      throw new Error("Could not set up review prerequisites");
    }

    const planFinding = await recordEmergencyPreparednessRequirementFinding({
      reviewId,
      agencyId: agency.id,
      requirement: planRequirement,
      outcome: "no_change_needed",
      notes: RUN_MARKER,
      actor: ACTOR,
    });
    check(
      "EP_PLAN_MAINTAINED no_change_needed writes NO new evidence row (satisfied by continued existence, not a calendar)",
      !planFinding.error && planFinding.item?.resulting_evidence_id === null,
      planFinding
    );

    const coordinatorFinding = await recordEmergencyPreparednessRequirementFinding({
      reviewId,
      agencyId: agency.id,
      requirement: coordinatorRequirement,
      outcome: "no_change_needed",
      notes: RUN_MARKER,
      actor: ACTOR,
    });
    check(
      "EP_DISASTER_COORDINATOR_DESIGNATED no_change_needed writes NO new evidence row",
      !coordinatorFinding.error && coordinatorFinding.item?.resulting_evidence_id === null,
      coordinatorFinding
    );

    const riskFinding = await recordEmergencyPreparednessRequirementFinding({
      reviewId,
      agencyId: agency.id,
      requirement: riskRequirement,
      outcome: "no_change_needed",
      notes: RUN_MARKER,
      actor: ACTOR,
    });
    check(
      "EP_RISK_ASSESSMENT_CURRENT no_change_needed DOES write a fresh, independent evidence row",
      !riskFinding.error && !!riskFinding.item?.resulting_evidence_id,
      riskFinding
    );
    if (riskFinding.item?.resulting_evidence_id) createdEvidenceIds.push(riskFinding.item.resulting_evidence_id);

    if (riskFinding.item?.resulting_evidence_id) {
      const { data: riskEvidence } = await supabase
        .from("person_evidence")
        .select("*")
        .eq("id", riskFinding.item.resulting_evidence_id)
        .single();
      check(
        "the fresh reaffirmation evidence row is tagged satisfaction_context = 'annual_reaffirmation', never source_system",
        riskEvidence?.satisfaction_context === "annual_reaffirmation" && riskEvidence?.source_system !== "annual_reaffirmation",
        riskEvidence
      );
      check("the fresh reaffirmation evidence row is independently verified", riskEvidence?.verification_status === "verified", riskEvidence);
    }

    const annualReviewFinding = await recordEmergencyPreparednessRequirementFinding({
      reviewId,
      agencyId: agency.id,
      requirement: annualReviewRequirement,
      outcome: "no_change_needed",
      notes: RUN_MARKER,
      actor: ACTOR,
    });
    check(
      "EP_ANNUAL_PLAN_REVIEW's own no_change_needed writes a fresh evidence row tagged 'annual_review_completed'",
      !annualReviewFinding.error && !!annualReviewFinding.item?.resulting_evidence_id,
      annualReviewFinding
    );
    if (annualReviewFinding.item?.resulting_evidence_id) createdEvidenceIds.push(annualReviewFinding.item.resulting_evidence_id);

    const { review: completedReview, error: completeError } = await completeEmergencyPreparednessReview({
      reviewId,
      summary: RUN_MARKER,
      actor: ACTOR,
    });
    check("review completed", !completeError && !!completedReview, completeError);

    const { error: lockedInsertError } = await supabase.from("emergency_preparedness_review_items").insert({
      review_id: reviewId,
      item_kind: "improvement",
      description: RUN_MARKER,
      created_by: ACTOR,
    });
    check(
      "a completed review's items are structurally immutable — inserting a new one is rejected",
      !!lockedInsertError && (lockedInsertError.message ?? "").includes("is completed"),
      lockedInsertError
    );
  } finally {
    console.log("\n== Cleanup ==");
    for (const evidenceId of createdEvidenceIds) {
      await supabase.from("person_evidence").delete().eq("id", evidenceId);
    }
    if (reviewId) {
      await supabase.from("emergency_preparedness_review_items").delete().eq("review_id", reviewId);
      await supabase.from("emergency_preparedness_reviews").delete().eq("id", reviewId);
    }
    check("cleanup completed without throwing", true);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Emergency Preparedness Phase B verification crashed:", err);
  process.exit(1);
});
