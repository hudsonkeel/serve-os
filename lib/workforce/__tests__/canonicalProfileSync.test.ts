// Pure-function tests for AxisCare sync's canonical-profile protection
// rules — see lib/workforce/canonicalProfileSync.ts. Covers the
// acceptance scenario: "reviewed canonical surname is not overwritten;
// source identity updates; discrepancy appears."
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/canonicalProfileSync.test.ts
import assert from "node:assert/strict";
import { evaluateCanonicalFieldSyncAction, isCanonicalProfileReviewed } from "../canonicalProfileSync.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── Seeding a null canonical value ────────────────────────────────────
test("a null canonical value is seeded from the source, reviewed or not", () => {
  assert.equal(evaluateCanonicalFieldSyncAction(null, false, "jessicah mudekunye"), "seed");
  assert.equal(evaluateCanonicalFieldSyncAction(null, true, "jessicah mudekunye"), "seed");
  assert.equal(evaluateCanonicalFieldSyncAction("", false, "jessicah mudekunye"), "seed");
});

test("a blank source value never seeds or changes anything", () => {
  assert.equal(evaluateCanonicalFieldSyncAction(null, false, null), "no_change");
  assert.equal(evaluateCanonicalFieldSyncAction(null, false, ""), "no_change");
  assert.equal(evaluateCanonicalFieldSyncAction("Jessicah", false, ""), "no_change");
});

// ─── Matching values ────────────────────────────────────────────────────
test("identical canonical and source values are a no-op", () => {
  assert.equal(evaluateCanonicalFieldSyncAction("Mudekunye", false, "Mudekunye"), "no_change");
  assert.equal(evaluateCanonicalFieldSyncAction("Mudekunye", true, "Mudekunye"), "no_change");
});

// ─── Capitalization-only, unreviewed ────────────────────────────────────
test("a capitalization-only difference on an UNREVIEWED profile auto-corrects", () => {
  assert.equal(evaluateCanonicalFieldSyncAction("Jessicah Mudekunye", false, "jessicah mudekunye"), "auto_correct_capitalization");
});

// ─── The acceptance-test case: reviewed profile is never overwritten ──
test("the acceptance case — a REVIEWED canonical surname is never auto-corrected, even for capitalization; a discrepancy is flagged instead", () => {
  const action = evaluateCanonicalFieldSyncAction("Mudekunye", true, "mudekunye");
  assert.equal(action, "flag_discrepancy");
});

test("a material (non-capitalization) difference always flags a discrepancy, reviewed or not", () => {
  assert.equal(evaluateCanonicalFieldSyncAction("Mudekunye", false, "Mudukunye"), "flag_discrepancy");
  assert.equal(evaluateCanonicalFieldSyncAction("Mudekunye", true, "Smith"), "flag_discrepancy");
});

// ─── isCanonicalProfileReviewed ─────────────────────────────────────────
test("isCanonicalProfileReviewed treats 'reviewed' and 'locked' as reviewed; 'unreviewed'/'needs_review' as not", () => {
  assert.equal(isCanonicalProfileReviewed("reviewed"), true);
  assert.equal(isCanonicalProfileReviewed("locked"), true);
  assert.equal(isCanonicalProfileReviewed("unreviewed"), false);
  assert.equal(isCanonicalProfileReviewed("needs_review"), false);
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
