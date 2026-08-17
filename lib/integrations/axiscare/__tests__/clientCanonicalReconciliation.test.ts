// Pure-function tests for the AxisCare -> Serve canonical bootstrap's
// one non-negotiable rule: AxisCare only ever fills a gap, never
// silently overwrites a fact Serve already owns.
//
//   node --experimental-strip-types --conditions=react-server lib/integrations/axiscare/__tests__/clientCanonicalReconciliation.test.ts
import assert from "node:assert/strict";
import { decideFieldReconciliation, classifyFieldForPreview } from "../clientCanonicalReconciliation.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("both null -> not_reviewed (nothing to reconcile yet)", () => {
  assert.equal(decideFieldReconciliation(null, null), "not_reviewed");
});

test("Serve null, AxisCare has a value -> apply", () => {
  assert.equal(decideFieldReconciliation(null, "1950-01-01"), "apply");
});

test("Serve has a value, AxisCare null -> skipped_serve_already_owns", () => {
  assert.equal(decideFieldReconciliation("1950-01-01", null), "skipped_serve_already_owns");
});

test("Serve and AxisCare agree -> skipped_serve_already_owns, not treated as a conflict", () => {
  assert.equal(decideFieldReconciliation("1950-01-01", "1950-01-01"), "skipped_serve_already_owns");
});

test("Serve and AxisCare disagree -> conflict_unresolved, never auto-resolved either direction", () => {
  assert.equal(decideFieldReconciliation("1950-01-01", "1952-06-15"), "conflict_unresolved");
});

test("REGRESSION: a populated Serve value is never eligible for 'apply', even when AxisCare disagrees — apply only ever fills a true gap", () => {
  const outcome = decideFieldReconciliation("Female", "Male");
  assert.notEqual(outcome, "apply");
  assert.equal(outcome, "conflict_unresolved");
});

test("empty-string Serve value is treated the same as null (a genuine gap)", () => {
  assert.equal(decideFieldReconciliation("", "1950-01-01"), "apply");
});

test("whitespace-only Serve value is treated the same as null", () => {
  assert.equal(decideFieldReconciliation("   ", "1950-01-01"), "apply");
});

// ─── classifyFieldForPreview — reporting-only, finer-grained ────────────

test("preview: both empty -> AXISCARE_EMPTY", () => {
  assert.equal(classifyFieldForPreview(null, null), "AXISCARE_EMPTY");
});

test("preview: Serve populated, AxisCare empty -> SERVE_ALREADY_OWNS (distinct from ALREADY_AGREES)", () => {
  assert.equal(classifyFieldForPreview("1950-01-01", null), "SERVE_ALREADY_OWNS");
});

test("preview: Serve empty, AxisCare populated -> WILL_POPULATE", () => {
  assert.equal(classifyFieldForPreview(null, "1950-01-01"), "WILL_POPULATE");
});

test("preview: both populated and equal -> ALREADY_AGREES (distinct from SERVE_ALREADY_OWNS)", () => {
  assert.equal(classifyFieldForPreview("1950-01-01", "1950-01-01"), "ALREADY_AGREES");
});

test("preview: both populated and different -> CONFLICT_REVIEW", () => {
  assert.equal(classifyFieldForPreview("1950-01-01", "1952-06-15"), "CONFLICT_REVIEW");
});

test("REGRESSION: preview never confuses SERVE_ALREADY_OWNS with ALREADY_AGREES — they are different states even though both mean 'no write'", () => {
  const owns = classifyFieldForPreview("Daughter", null);
  const agrees = classifyFieldForPreview("Daughter", "Daughter");
  assert.equal(owns, "SERVE_ALREADY_OWNS");
  assert.equal(agrees, "ALREADY_AGREES");
  assert.notEqual(owns, agrees);
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err);
    }
  }
  console.log(`\n${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();
