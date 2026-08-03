// Pure-function tests for the Employee Record Audit's plain-language
// readiness vocabulary — see lib/workforce/employeeRecordAuditReadiness.ts.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/employeeRecordAuditReadiness.test.ts
import assert from "node:assert/strict";
import { deriveEmployeeRecordAuditReadiness } from "../employeeRecordAuditReadiness.ts";
import type { RequirementSetEvaluation } from "../../compliance/requirementSetStatus.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function registry(overrides: Partial<RequirementSetEvaluation> = {}): RequirementSetEvaluation {
  return {
    status: "complete",
    explanation: "All requirements are satisfied and verified.",
    requirements: [],
    ...overrides,
  };
}

test("terminated caregivers are always not_applicable, regardless of the raw registry status", () => {
  const result = deriveEmployeeRecordAuditReadiness("terminated", registry({ status: "incomplete", explanation: "Incomplete because X is missing." }));
  assert.equal(result.readiness, "not_applicable");
  assert.equal(result.explanation, "Not currently required — caregiver terminated.");
});

test("active caregiver with complete registry is ready", () => {
  const result = deriveEmployeeRecordAuditReadiness("active", registry({ status: "complete" }));
  assert.equal(result.readiness, "ready");
});

test("expired, requires_review, and incomplete registry statuses all map to blocked", () => {
  for (const status of ["expired", "requires_review", "incomplete"] as const) {
    const result = deriveEmployeeRecordAuditReadiness("active", registry({ status, explanation: `${status} explanation` }));
    assert.equal(result.readiness, "blocked", `${status} should map to blocked`);
    assert.equal(result.explanation, `${status} explanation`);
  }
});

test("awaiting_verification registry status maps to awaiting_verification readiness", () => {
  const result = deriveEmployeeRecordAuditReadiness("active", registry({ status: "awaiting_verification" }));
  assert.equal(result.readiness, "awaiting_verification");
});

test("expiring_soon registry status maps to expiring_soon readiness", () => {
  const result = deriveEmployeeRecordAuditReadiness("active", registry({ status: "expiring_soon" }));
  assert.equal(result.readiness, "expiring_soon");
});

test("pending_start and inactive caregivers are evaluated normally (not treated as terminated)", () => {
  assert.equal(deriveEmployeeRecordAuditReadiness("pending_start", registry({ status: "complete" })).readiness, "ready");
  assert.equal(deriveEmployeeRecordAuditReadiness("inactive", registry({ status: "complete" })).readiness, "ready");
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();
