import assert from "node:assert/strict";
import type { RecruitingLeadObservation } from "../../../supabase/types.ts";
import { interviewActivityPresent } from "../interviewActivityPresent.ts";
import { positiveCandidateAssessmentPresent } from "../positiveCandidateAssessmentPresent.ts";
import { interviewScheduledOrRescheduled } from "../interviewScheduledOrRescheduled.ts";
import { interviewCompletionUnconfirmed } from "../interviewCompletionUnconfirmed.ts";
import { possiblePipelineStageInconsistency } from "../possiblePipelineStageInconsistency.ts";
import { crossSystemStageInconsistency } from "../crossSystemStageInconsistency.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

let counter = 0;
function obs(overrides: Partial<RecruitingLeadObservation>): RecruitingLeadObservation {
  counter++;
  return {
    id: `obs-${counter}`,
    collector_run_id: "run-1",
    recruiting_lead_id: "lead-1",
    observation_key: "apploi.pipeline_stage",
    raw_label: null,
    normalized_value: null,
    visibility: "directly_observed",
    observed_at: "2026-07-21T00:00:00.000Z",
    created_at: "2026-07-21T00:00:00.000Z",
    source_system: "apploi",
    source_record_id: null,
    collected_at: "2026-07-21T00:00:00.000Z",
    source_location: null,
    extractor_version: null,
    extraction_confidence: null,
    match_method: null,
    failure_reason: null,
    sensitivity: "standard",
    collection_method: "guided_manual",
    ...overrides,
  };
}

// ─── Rule A ────────────────────────────────────────────────────────────────
test("interviewActivityPresent fires on an observed interview timeline event", () => {
  const result = interviewActivityPresent.evaluate([
    obs({ observation_key: "apploi.timeline.interview_event_present", normalized_value: "true" }),
  ]);
  assert.ok(result);
  assert.equal(result!.signalKey, "recruiting.interview_activity_present");
  assert.equal(result!.strength, "strong");
});

test("interviewActivityPresent does not fire on no evidence", () => {
  assert.equal(interviewActivityPresent.evaluate([]), null);
});

test("interviewActivityPresent does not fire on 'not_visible' — never treats absence-of-observation as negative evidence", () => {
  const result = interviewActivityPresent.evaluate([
    obs({ observation_key: "apploi.timeline.interview_event_present", visibility: "not_visible", normalized_value: null }),
  ]);
  assert.equal(result, null);
});

// ─── Rule B ────────────────────────────────────────────────────────────────
test("positiveCandidateAssessmentPresent fires on a match_indicator label, never implies completion", () => {
  const result = positiveCandidateAssessmentPresent.evaluate([
    obs({ observation_key: "apploi.match_indicator", normalized_value: "Good Match" }),
  ]);
  assert.ok(result);
  assert.ok(!/completed/i.test(result!.explanation), "explanation must never assert completion");
  assert.ok(result!.unresolvedAlternatives.some((a) => /must never be combined/i.test(a)));
});

test("positiveCandidateAssessmentPresent does not fire when neither rating nor match_indicator is present", () => {
  assert.equal(positiveCandidateAssessmentPresent.evaluate([]), null);
});

test("positiveCandidateAssessmentPresent reports 'positive rating evidence' — never 'Good Match' — when only the star rating is observed", () => {
  const result = positiveCandidateAssessmentPresent.evaluate([
    obs({ observation_key: "apploi.candidate_rating", normalized_value: '{"score":5,"scale":5}' }),
  ]);
  assert.ok(result);
  assert.ok(!/good match/i.test(result!.explanation), "must never say 'Good Match' when only the numeric rating was observed");
  assert.ok(/positive rating evidence/i.test(result!.explanation));
});

test("positiveCandidateAssessmentPresent treats candidate_rating and match_indicator as distinct, both cited when both present", () => {
  const rating = obs({ observation_key: "apploi.candidate_rating", normalized_value: '{"score":5,"scale":5}' });
  const matchIndicator = obs({ observation_key: "apploi.match_indicator", normalized_value: "Good Match" });
  const result = positiveCandidateAssessmentPresent.evaluate([rating, matchIndicator]);
  assert.ok(result);
  assert.equal(result!.supportingObservationIds.length, 2);
  assert.ok(result!.unresolvedAlternatives.some((a) => /same underlying vendor concept/i.test(a)));
});

// ─── Rule C ────────────────────────────────────────────────────────────────
test("interviewScheduledOrRescheduled fires on a candidate confirmation alone", () => {
  const result = interviewScheduledOrRescheduled.evaluate([
    obs({ observation_key: "apploi.candidate_response_confirming_interview", normalized_value: "true" }),
  ]);
  assert.ok(result);
  assert.equal(result!.strength, "strong");
});

// ─── Rule D — the completion-guard rule ────────────────────────────────────
test("interviewCompletionUnconfirmed fires when activity exists with no completion evidence", () => {
  const result = interviewCompletionUnconfirmed.evaluate([
    obs({ observation_key: "apploi.interview_reschedule_evidence", normalized_value: "true" }),
  ]);
  assert.ok(result);
  assert.equal(result!.strength, "moderate");
});

test("interviewCompletionUnconfirmed does NOT fire when direct completion evidence exists", () => {
  const result = interviewCompletionUnconfirmed.evaluate([
    obs({ observation_key: "apploi.interview_reschedule_evidence", normalized_value: "true" }),
    obs({ observation_key: "apploi.interview_completed_evidence", normalized_value: "true" }),
  ]);
  assert.equal(result, null);
});

test("interviewCompletionUnconfirmed does not fire with zero activity", () => {
  assert.equal(interviewCompletionUnconfirmed.evaluate([]), null);
});

// ─── Rule E ────────────────────────────────────────────────────────────────
test("possiblePipelineStageInconsistency fires on early stage + reschedule activity", () => {
  const result = possiblePipelineStageInconsistency.evaluate([
    obs({ observation_key: "apploi.pipeline_stage", normalized_value: "Requested Interview" }),
    obs({ observation_key: "apploi.interview_reschedule_evidence", normalized_value: "true" }),
  ]);
  assert.ok(result);
  assert.ok(!/incorrect/i.test(result!.explanation), "must never assert the pipeline is incorrect");
});

test("possiblePipelineStageInconsistency does not fire on early stage alone, with no other activity", () => {
  const result = possiblePipelineStageInconsistency.evaluate([
    obs({ observation_key: "apploi.pipeline_stage", normalized_value: "Requested Interview" }),
  ]);
  assert.equal(result, null);
});

test("possiblePipelineStageInconsistency does not fire on a late-stage label", () => {
  const result = possiblePipelineStageInconsistency.evaluate([
    obs({ observation_key: "apploi.pipeline_stage", normalized_value: "Offer Extended" }),
    obs({ observation_key: "apploi.interview_reschedule_evidence", normalized_value: "true" }),
  ]);
  assert.equal(result, null);
});

// ─── Regression guard: pipeline_stage/application_status must never be
// conflated (per the follow-up review decision). The mere co-occurrence
// of a board-level stage and a candidate-level sub-status — even one that
// looks like it could be "early" — must never by itself produce a stage
// inconsistency. Neither rule currently reads apploi.application_status
// at all; this test exists to catch a future change that naively wires
// the two together without the "genuinely incompatible or stale" logic
// the review requires.
test("possiblePipelineStageInconsistency does not fire merely from pipeline_stage='Interview' co-existing with an application_status observation", () => {
  const result = possiblePipelineStageInconsistency.evaluate([
    obs({ observation_key: "apploi.pipeline_stage", normalized_value: "Interview" }),
    obs({ observation_key: "apploi.application_status", normalized_value: "Requested Interview" }),
  ]);
  assert.equal(result, null, "a real board stage plus a real sub-status must not, by themselves, produce an inconsistency");
});

// ─── Rule F ────────────────────────────────────────────────────────────────
test("crossSystemStageInconsistency fires on early Apploi stage + existing Viventium record, never asserts hired", () => {
  const result = crossSystemStageInconsistency.evaluate([
    obs({ observation_key: "apploi.pipeline_stage", normalized_value: "Requested Interview", source_system: "apploi" }),
    obs({ observation_key: "viventium.employee_record_exists", normalized_value: "true", source_system: "viventium" }),
  ]);
  assert.ok(result);
  assert.equal(result!.strength, "strong");
  assert.ok(!/hired/i.test(result!.explanation), "must never assert the candidate is hired");
});

test("crossSystemStageInconsistency does not fire when Viventium has no record", () => {
  const result = crossSystemStageInconsistency.evaluate([
    obs({ observation_key: "apploi.pipeline_stage", normalized_value: "Requested Interview" }),
  ]);
  assert.equal(result, null);
});

// ─── Regression guard: the first persisted Apploi Candidate Dialog
// Collector flight (candidate_name, position, resume_availability,
// viventium_integration_status, all directly observed) must legitimately
// produce zero inferences — none of the six rules consume any of these
// four observation keys. A future change must not manufacture an
// inference just to prove the rule engine works.
test("no rule fires on the approved initial production observation set alone (candidate_name, position, resume_availability, viventium_integration_status)", () => {
  const observations = [
    obs({ observation_key: "apploi.candidate_name", normalized_value: "Alma Dhora Owolabi" }),
    obs({ observation_key: "apploi.position", normalized_value: "Independent Living Community Caregiver" }),
    obs({ observation_key: "apploi.resume_availability", normalized_value: "not_available" }),
    obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" }),
  ];

  const rules = [
    interviewActivityPresent,
    positiveCandidateAssessmentPresent,
    interviewScheduledOrRescheduled,
    interviewCompletionUnconfirmed,
    possiblePipelineStageInconsistency,
    crossSystemStageInconsistency,
  ];

  for (const rule of rules) {
    assert.equal(rule.evaluate(observations), null, `${rule.slug} must not fire on this observation set`);
  }
});

console.log(`\n${passed}/${passed} passed`);
