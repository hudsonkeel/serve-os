import assert from "node:assert/strict";
import { evaluateRecruitingTransitions, RECRUITING_TRANSITIONS } from "../transitions.ts";
import type { DesiredStateEvaluationResult } from "../types.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

function result(key: string, status: DesiredStateEvaluationResult["status"]): DesiredStateEvaluationResult {
  return {
    desiredStateKey: key,
    desiredStateVersion: 1,
    status,
    gaps: [],
    unknownEvidence: [],
    explanation: "",
    supportingObservationIds: [],
  };
}

test("a transition to an already-satisfied target reports 'completed'", () => {
  const results = [result("recruiting.desired_state.hiring_decision_confirmed", "satisfied")];
  const transitions = evaluateRecruitingTransitions(results);
  const target = transitions.find((tr) => tr.transitionKey === "recruiting.transition.evaluation_to_hiring_decision");
  assert.equal(target?.availability, "completed");
});

test("a transition whose source state isn't satisfied yet reports 'not_yet_reachable'", () => {
  const results = [result("recruiting.desired_state.candidate_evaluation_complete", "unknown")];
  const transitions = evaluateRecruitingTransitions(results);
  const t = transitions.find((tr) => tr.transitionKey === "recruiting.transition.evaluation_to_hiring_decision");
  assert.equal(t?.availability, "not_yet_reachable");
});

test("a transition whose source state IS satisfied reports 'available'", () => {
  const results = [result("recruiting.desired_state.candidate_evaluation_complete", "satisfied")];
  const transitions = evaluateRecruitingTransitions(results);
  const t = transitions.find((tr) => tr.transitionKey === "recruiting.transition.evaluation_to_hiring_decision");
  assert.equal(t?.availability, "available");
});

test("a transition whose target state is blocked reports 'blocked'", () => {
  const results = [result("recruiting.desired_state.hiring_decision_confirmed", "blocked")];
  const transitions = evaluateRecruitingTransitions(results);
  const t = transitions.find((tr) => tr.transitionKey === "recruiting.transition.evaluation_to_hiring_decision");
  assert.equal(t?.availability, "blocked");
});

test("the hiring-decision transition is explicitly human-owned, never automatic", () => {
  const def = RECRUITING_TRANSITIONS.find((d) => d.key === "recruiting.transition.evaluation_to_hiring_decision");
  assert.equal(def?.decisionBoundary, "human");
});

test("every other defined transition is automatic (evaluated from evidence, no human sign-off to advance)", () => {
  const nonHiring = RECRUITING_TRANSITIONS.filter((d) => d.key !== "recruiting.transition.evaluation_to_hiring_decision");
  for (const d of nonHiring) assert.equal(d.decisionBoundary, "automatic");
});

console.log(`\n${passed}/${passed} passed`);
