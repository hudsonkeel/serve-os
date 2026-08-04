import assert from "node:assert/strict";
import { evaluateWorkforceCapabilities, WORKFORCE_CAPABILITIES } from "../capabilities.ts";
import type { DesiredStateEvaluationResult } from "../types.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${passed}. ${name}`);
}

function result(overrides: Partial<DesiredStateEvaluationResult>): DesiredStateEvaluationResult {
  return {
    desiredStateKey: "recruiting.desired_state.employment_record_confirmed",
    desiredStateVersion: 1,
    status: "unknown",
    gaps: [],
    unknownEvidence: [],
    explanation: "",
    supportingObservationIds: [],
    ...overrides,
  };
}

test("Employment Record Confirmed satisfied grants 'may continue onboarding' but NOTHING else", () => {
  const results = [result({ status: "satisfied" })];
  const capabilities = evaluateWorkforceCapabilities(results);
  const onboarding = capabilities.find((c) => c.capabilityKey === "workforce.may_continue_employment_onboarding");
  const payroll = capabilities.find((c) => c.capabilityKey === "workforce.may_receive_payroll");
  const scheduling = capabilities.find((c) => c.capabilityKey === "workforce.may_be_assigned_to_client");

  assert.equal(onboarding?.status, "granted");
  assert.notEqual(payroll?.status, "granted");
  assert.notEqual(scheduling?.status, "granted");
});

test("no capability is granted with zero evidence", () => {
  const results: DesiredStateEvaluationResult[] = [];
  const capabilities = evaluateWorkforceCapabilities(results);
  for (const c of capabilities) assert.notEqual(c.status, "granted");
});

test("a capability gated on a blocked Desired State reports not_granted, never granted", () => {
  const results = [
    result({ desiredStateKey: "recruiting.desired_state.employment_requirements_complete", status: "blocked" }),
  ];
  const capabilities = evaluateWorkforceCapabilities(results);
  const payroll = capabilities.find((c) => c.capabilityKey === "workforce.may_receive_payroll");
  assert.equal(payroll?.status, "not_granted");
});

test("every capability names its required Desired States explicitly (no implicit inference)", () => {
  for (const def of WORKFORCE_CAPABILITIES) {
    assert.ok(def.requiredSatisfiedStates.length > 0);
  }
});

test("WORKFORCE_CAPABILITIES has exactly the three reference capabilities, no overreach", () => {
  assert.equal(WORKFORCE_CAPABILITIES.length, 3);
});

console.log(`\n${passed}/${passed} passed`);
