import assert from "node:assert/strict";
import { generateRecommendations, selectNextRecommendedAction } from "../generateRecommendations.ts";
import { evaluateRecruitingLifecycle } from "../evaluateRecruitingLifecycle.ts";
import type { RecruitingEvidenceBundle, DesiredStateEvaluationResult } from "../types.ts";
import type { RecruitingLeadObservation, RecruitingLeadVendorIdentity } from "../../../supabase/types.ts";

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
    observation_key: "apploi.candidate_name",
    raw_label: null,
    normalized_value: null,
    visibility: "directly_observed",
    observed_at: "2026-07-30T00:00:00.000Z",
    created_at: "2026-07-30T00:00:00.000Z",
    source_system: "apploi",
    source_record_id: null,
    collected_at: "2026-07-30T00:00:00.000Z",
    source_location: null,
    extractor_version: null,
    extraction_confidence: null,
    match_method: null,
    failure_reason: null,
    sensitivity: "standard",
    collection_method: "automatic_dom",
    ...overrides,
  };
}

function vendorIdentity(overrides: Partial<RecruitingLeadVendorIdentity>): RecruitingLeadVendorIdentity {
  return {
    id: `vid-${++counter}`,
    recruiting_lead_id: "lead-1",
    source_system: "apploi",
    vendor_record_id: "candidate-123",
    vendor_display_name: "Alma Dhora Owolabi",
    match_method: "vendor_id",
    match_confidence: "high",
    is_human_confirmed: true,
    linked_by: "Hud",
    linked_at: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function almaBundle(): RecruitingEvidenceBundle {
  return {
    observations: [
      obs({ observation_key: "apploi.candidate_name", normalized_value: "Alma Dhora Owolabi" }),
      obs({ observation_key: "apploi.application_exists", normalized_value: "true" }),
      obs({ observation_key: "apploi.resume_availability", normalized_value: "not_available" }),
      obs({ observation_key: "apploi.viventium_integration_status", normalized_value: "no_integration_record_found" }),
    ],
    inferences: [],
    humanConfirmations: [],
    vendorIdentities: [vendorIdentity({})],
  };
}

test("recommendations only ever derive from a Gap or an unresolved stage — never a raw observation directly", () => {
  const results = evaluateRecruitingLifecycle(almaBundle());
  const recommendations = generateRecommendations(results);
  for (const r of recommendations) {
    // Every recommendation must trace back to either a gap's requirementKey
    // or a desired-state key — never bypass straight to an observation id.
    assert.ok(r.desiredStateKey.startsWith("recruiting.desired_state."));
    assert.ok(r.explanation.length > 0);
  }
});

test("no Blocking Gap anywhere -> next recommended action is evidence-gathering, not a remediation claim", () => {
  const results = evaluateRecruitingLifecycle(almaBundle());
  const recommendations = generateRecommendations(results);
  const nextAction = selectNextRecommendedAction(recommendations);
  assert.ok(nextAction);
  assert.ok(!/failed|has not been hired|no employment record exists/i.test(nextAction!));
  assert.ok(/collect/i.test(nextAction!));
});

test("Alma's next recommended action names candidate-evaluation and employment-record evidence, in lifecycle order", () => {
  const results = evaluateRecruitingLifecycle(almaBundle());
  const recommendations = generateRecommendations(results);
  const nextAction = selectNextRecommendedAction(recommendations);
  assert.ok(/candidate-evaluation evidence/i.test(nextAction!));
  assert.ok(/employment-record evidence/i.test(nextAction!));
});

test("a Blocking Gap always outranks evidence-gathering recommendations", () => {
  const results: DesiredStateEvaluationResult[] = [
    {
      desiredStateKey: "recruiting.desired_state.hiring_decision_confirmed",
      desiredStateVersion: 1,
      status: "blocked",
      gaps: [
        {
          kind: "blocking",
          desiredStateKey: "recruiting.desired_state.hiring_decision_confirmed",
          requirementKey: "recruiting.possible_pipeline_stage_inconsistency",
          description: "An unresolved inconsistency exists.",
          observedValue: "present",
          missingEvidence: ["A human review."],
        },
      ],
      unknownEvidence: [],
      explanation: "blocked",
      supportingObservationIds: [],
    },
    {
      desiredStateKey: "recruiting.desired_state.employment_record_confirmed",
      desiredStateVersion: 1,
      status: "unknown",
      gaps: [],
      unknownEvidence: ["viventium.employee_record_exists: no evidence collected yet."],
      explanation: "unknown",
      supportingObservationIds: [],
    },
  ];
  const recommendations = generateRecommendations(results);
  const nextAction = selectNextRecommendedAction(recommendations);
  assert.ok(/review the conflicting/i.test(nextAction!));
});

test("selectNextRecommendedAction returns null when there is nothing to recommend", () => {
  assert.equal(selectNextRecommendedAction([]), null);
});

console.log(`\n${passed}/${passed} passed`);
