// Pure-function tests for lib/intake/serviceOpportunityMapping.ts. Run with:
//   npm run test:intake
import assert from "node:assert/strict";
import { mapSupportTypeToServiceOpportunity } from "../serviceOpportunityMapping.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. no support type -> falls back to free text alone", () => {
  const result = mapSupportTypeToServiceOpportunity(null, "Needs help with meals");
  assert.equal(result.serviceSummary, "Needs help with meals");
  assert.deepEqual(result.matchedSupportLabels, []);
});

test("2. no support type and no free text -> null summary, never fabricated", () => {
  const result = mapSupportTypeToServiceOpportunity(null, null);
  assert.equal(result.serviceSummary, null);
});

test("3. single recognized support type maps to its label", () => {
  const result = mapSupportTypeToServiceOpportunity("medication_reminders", null);
  assert.deepEqual(result.matchedSupportLabels, ["Medication Assistance"]);
});

test("4. multiple comma-separated support types all map", () => {
  const result = mapSupportTypeToServiceOpportunity("companionship, personal_care", null);
  assert.deepEqual(result.matchedSupportLabels, ["Companionship", "Personal Care"]);
});

test("5. unrecognized support type is preserved verbatim, not dropped", () => {
  const result = mapSupportTypeToServiceOpportunity("some_future_service", null);
  assert.deepEqual(result.matchedSupportLabels, ["some_future_service"]);
});

test("6. support type label and free text are combined in the summary", () => {
  const result = mapSupportTypeToServiceOpportunity("transportation", "Needs rides to dialysis");
  assert.equal(result.serviceSummary, "Transportation — Needs rides to dialysis");
});

test("7. is case/spacing tolerant on the support-type token", () => {
  const result = mapSupportTypeToServiceOpportunity("Household Help", null);
  assert.deepEqual(result.matchedSupportLabels, ["Household Support"]);
});

// ─── Runner ──────────────────────────────────────────────────────────

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
