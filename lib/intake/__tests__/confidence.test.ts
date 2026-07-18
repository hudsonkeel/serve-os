// Pure-function tests for lib/intake/confidence.ts. Run with:
//   npm run test:intake
import assert from "node:assert/strict";
import { confidenceBandForScore, scoreIntakeSubmission } from "../confidence.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. no reason codes -> base score of 50", () => {
  assert.equal(scoreIntakeSubmission([]), 50);
});

test("2. score is deterministic: same reason codes always produce the same score", () => {
  const codes = ["WATERMERE_SELECTED", "RESIDENT_EXACT_MATCH", "CONTACT_METHOD_PRESENT"] as const;
  assert.equal(scoreIntakeSubmission(codes), scoreIntakeSubmission(codes));
  assert.equal(scoreIntakeSubmission([...codes].reverse()), scoreIntakeSubmission(codes));
});

test("3. score clamps at 100 even with many additions", () => {
  const codes = [
    "WATERMERE_SELECTED",
    "RESIDENT_EXACT_MATCH",
    "PROSPECTIVE_CLIENT_IDENTITY_COMPLETE",
    "PRIMARY_CONTACT_IDENTITY_COMPLETE",
    "SERVICE_LOCATION_COMPLETE",
    "CONTACT_METHOD_PRESENT",
    "SERVICE_NEED_PRESENT",
    "TIMING_PRESENT",
  ] as const;
  assert.equal(scoreIntakeSubmission(codes), 100);
});

test("4. score clamps at 0 even with many deductions", () => {
  const codes = [
    "UNSUPPORTED_INTAKE_TYPE",
    "UNKNOWN_SCHEMA",
    "CONTACT_METHOD_MISSING",
    "RESIDENT_MATCH_REQUIRED",
  ] as const;
  assert.equal(scoreIntakeSubmission(codes), 0);
});

test("5. confidenceBandForScore: 100 -> automatic", () => {
  assert.equal(confidenceBandForScore(100), "automatic");
});

test("6. confidenceBandForScore: 90-99 -> high_confidence", () => {
  assert.equal(confidenceBandForScore(90), "high_confidence");
  assert.equal(confidenceBandForScore(99), "high_confidence");
});

test("7. confidenceBandForScore: 70-89 -> review_recommended", () => {
  assert.equal(confidenceBandForScore(70), "review_recommended");
  assert.equal(confidenceBandForScore(89), "review_recommended");
});

test("8. confidenceBandForScore: below 70 -> needs_review", () => {
  assert.equal(confidenceBandForScore(69), "needs_review");
  assert.equal(confidenceBandForScore(0), "needs_review");
});

test("9. an unrecognized reason code contributes nothing rather than throwing", () => {
  const futureCode = "SOME_FUTURE_CODE" as Parameters<typeof scoreIntakeSubmission>[0][number];
  assert.equal(scoreIntakeSubmission([futureCode]), 50);
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
