// Tests for lib/intelligence/domains/compliance/backgroundEligibility/operationalOutcome.ts
// Run with: npm run test:governance
import assert from "node:assert/strict";
import { classifyBackgroundEligibility } from "../classificationEngine.ts";
import { normalizeOffenses } from "../normalizeOffense.ts";
import { mapToOperationalOutcome } from "../operationalOutcome.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. Eligible classification -> eligible_to_proceed", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses([]));
  assert.equal(mapToOperationalOutcome(result), "eligible_to_proceed");
});

test("2. Automatic Disqualification -> cannot_proceed, no review status needed", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Murder"]));
  assert.equal(mapToOperationalOutcome(result), "cannot_proceed");
});

test("3. Presumptive Disqualification, no review yet -> executive_review_required", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Felony Theft"]));
  assert.equal(mapToOperationalOutcome(result), "executive_review_required");
});

test("4. Presumptive Disqualification, review upholds it -> cannot_proceed", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Felony Theft"]));
  assert.equal(
    mapToOperationalOutcome(result, { presumptiveReviewOutcome: "upheld" }),
    "cannot_proceed",
  );
});

test("5. Presumptive Disqualification, review overrides it -> eligible_to_proceed", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Felony Theft"]));
  assert.equal(
    mapToOperationalOutcome(result, { presumptiveReviewOutcome: "overridden" }),
    "eligible_to_proceed",
  );
});

test("6. Reviewable, no review yet -> decision_pending", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Simple Possession"]));
  assert.equal(mapToOperationalOutcome(result), "decision_pending");
});

test("7. Reviewable, individualized review clears the applicant -> eligible_to_proceed", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Simple Possession"]));
  assert.equal(
    mapToOperationalOutcome(result, { individualizedReviewOutcome: "cleared" }),
    "eligible_to_proceed",
  );
});

test("8. Reviewable, individualized review does not clear the applicant -> cannot_proceed", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Simple Possession"]));
  assert.equal(
    mapToOperationalOutcome(result, { individualizedReviewOutcome: "not_cleared" }),
    "cannot_proceed",
  );
});

test("9. normalization failure -> insufficient_evidence", () => {
  const result = classifyBackgroundEligibility(normalizeOffenses(["Not In The Taxonomy"]));
  assert.equal(mapToOperationalOutcome(result), "insufficient_evidence");
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
