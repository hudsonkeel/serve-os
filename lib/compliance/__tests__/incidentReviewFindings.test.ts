// Pure-function tests for ../incidentReviewFindings.ts — no database,
// matching lib/compliance/__tests__/incidentResolutionEligibility.test.ts's
// established convention. Run with:
//   node --experimental-strip-types --conditions=react-server lib/compliance/__tests__/incidentReviewFindings.test.ts
import assert from "node:assert/strict";
import { resolveReviewFindingsOnReaffirm } from "../incidentReviewFindings.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// The canonical acceptance case: the medication incident was reviewed
// before review_findings existed, so it currently reads null and — before
// this fix — could never receive findings without recreating the record.
test("legacy reviewed incident (review_findings null) — a non-blank value is accepted", () => {
  const result = resolveReviewFindingsOnReaffirm(null, "Medication administered without required second-signature verification.");
  assert.equal(result, "Medication administered without required second-signature verification.");
});

test("legacy reviewed incident — the proposed value is trimmed", () => {
  const result = resolveReviewFindingsOnReaffirm(null, "  Contributing factor: rushed shift handoff.  ");
  assert.equal(result, "Contributing factor: rushed shift handoff.");
});

test("legacy reviewed incident — a blank/whitespace-only proposal leaves it null, no error", () => {
  assert.equal(resolveReviewFindingsOnReaffirm(null, "   "), null);
  assert.equal(resolveReviewFindingsOnReaffirm(null, ""), null);
});

test("legacy reviewed incident — an undefined proposal (re-affirm call that never collected findings) leaves it null", () => {
  assert.equal(resolveReviewFindingsOnReaffirm(null, undefined), null);
});

// Once populated, frozen — the core "no silent overwrite" guarantee.
test("already-populated findings are never overwritten by a later re-affirm, even with a new non-blank value", () => {
  const result = resolveReviewFindingsOnReaffirm(
    "Original finding: verification step was skipped.",
    "A completely different finding someone tried to substitute in."
  );
  assert.equal(result, "Original finding: verification step was skipped.");
});

test("already-populated findings survive a blank re-affirm proposal too", () => {
  const result = resolveReviewFindingsOnReaffirm("Original finding.", "");
  assert.equal(result, "Original finding.");
});

test("already-populated findings survive an undefined re-affirm proposal", () => {
  const result = resolveReviewFindingsOnReaffirm("Original finding.", undefined);
  assert.equal(result, "Original finding.");
});

test("the legacy backfill is one-time: a second re-affirm call cannot change what the first one set", () => {
  const afterFirstBackfill = resolveReviewFindingsOnReaffirm(null, "First recorded finding.");
  assert.equal(afterFirstBackfill, "First recorded finding.");

  const afterSecondCall = resolveReviewFindingsOnReaffirm(afterFirstBackfill, "Attempted second finding.");
  assert.equal(afterSecondCall, "First recorded finding.");
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
