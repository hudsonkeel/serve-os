// Tests for lib/intelligence/domains/compliance/backgroundEligibility/classificationEngine.ts
// Run with: npm run test:governance
import assert from "node:assert/strict";
import { classifyBackgroundEligibility } from "../classificationEngine.ts";
import { normalizeOffenses } from "../normalizeOffense.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. no findings -> Eligible (deterministic fallback, not a default assumption)", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses([]));
  assert.equal(result.outcome, "classified");
  assert.equal(result.outcome === "classified" ? result.match.classification : null, "eligible");
});

test("2. a Violence finding -> Automatic Disqualification, evaluation stops (mutual exclusivity)", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Aggravated Assault"]));
  assert.equal(result.outcome, "classified");
  assert.equal(result.outcome === "classified" ? result.match.classification : null, "automatic_disqualification");
});

test("3. a Felony Theft finding -> Presumptive Disqualification, routed to executive review", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Felony Theft"]));
  assert.equal(result.outcome, "classified");
  if (result.outcome === "classified") {
    assert.equal(result.match.classification, "presumptive_disqualification");
    assert.equal(result.match.reviewProcedure, "executive_review");
  }
});

test("4. a Simple Possession finding -> Reviewable, routed to individualized review", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Simple Possession"]));
  assert.equal(result.outcome, "classified");
  if (result.outcome === "classified") {
    assert.equal(result.match.classification, "reviewable");
    assert.equal(result.match.reviewProcedure, "individualized_review");
  }
});

test("5. an Automatic Disqualification finding beats a co-occurring lower-tier finding (evaluation order, step 2 before 3/4)", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Simple Possession", "Murder"]));
  assert.equal(result.outcome, "classified");
  assert.equal(result.outcome === "classified" ? result.match.classification : null, "automatic_disqualification");
});

test("6. an unrecognized offense escalates for human review rather than silently defaulting", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Some Offense Not In The Taxonomy"]));
  assert.equal(result.outcome, "escalate_normalization_failure");
  if (result.outcome === "escalate_normalization_failure") {
    assert.deepEqual(result.unrecognizedOffenses, ["Some Offense Not In The Taxonomy"]);
  }
});

test("7. offense matching is case-insensitive", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["murder"]));
  assert.equal(result.outcome, "classified");
  assert.equal(result.outcome === "classified" ? result.match.classification : null, "automatic_disqualification");
});

test("8. determinism: identical input produces an identical result", () => {
  const input = normalizeOffenses(["Felony Theft"]);
  const a = classifyBackgroundEligibility(input);
  const b = classifyBackgroundEligibility(input);
  assert.deepEqual(a, b);
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
