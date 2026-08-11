import assert from "node:assert/strict";
import { computeReviewExceptions, type DraftFactForReview, type FactConflictForReview } from "../reviewExceptions.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function draftFact(overrides: Partial<DraftFactForReview> & { id: string; fieldPath: string }): DraftFactForReview {
  return {
    value: true,
    assertionState: "confirmed_yes",
    collectionMethod: "reported",
    reporter: "resident",
    evidence: "some evidence",
    confidence: "high",
    ...overrides,
  };
}

// Note: the domain registry has several fields marked requiredForReview (e.g. primary_goals,
// allergies) — any test below that doesn't supply them will also see "missing_required"
// exceptions for those, which is correct behavior (a genuinely missing required field should
// be surfaced). These tests filter to the specific exception kind under test rather than
// asserting on the raw total, so they stay correct regardless of how many required-for-review
// fields the registry defines.

test("a confirmed fact with real confidence and no conflict is 'clear' — not surfaced as an uncertain/conflicting exception", () => {
  const summary = computeReviewExceptions([draftFact({ id: "1", fieldPath: "daily_life.bathing" })], []);
  const nonMissingExceptions = summary.exceptions.filter((e) => e.kind !== "missing_required");
  assert.equal(nonMissingExceptions.length, 0);
  assert.equal(summary.clearFacts.length, 1);
});

test("an uncertain fact is surfaced as an exception, not silently approved", () => {
  const summary = computeReviewExceptions(
    [draftFact({ id: "1", fieldPath: "mobility_safety.walker", assertionState: "uncertain" })],
    []
  );
  const uncertainExceptions = summary.exceptions.filter((e) => e.kind === "uncertain");
  assert.equal(uncertainExceptions.length, 1);
  assert.equal(uncertainExceptions[0].fieldPath, "mobility_safety.walker");
  assert.equal(summary.clearFacts.length, 0);
});

test("a field with an open conflict is surfaced as 'conflicting', overriding an otherwise-confirmed status", () => {
  const facts = [
    draftFact({ id: "1", fieldPath: "mobility_safety.recent_falls", assertionState: "confirmed_no", reporter: "resident" }),
    draftFact({ id: "2", fieldPath: "mobility_safety.recent_falls", assertionState: "confirmed_yes", reporter: "daughter" }),
  ];
  const conflicts: FactConflictForReview[] = [
    { id: "c1", fieldPath: "mobility_safety.recent_falls", factADraftId: "1", factBDraftId: "2", status: "open" },
  ];
  const summary = computeReviewExceptions(facts, conflicts);
  const conflictingExceptions = summary.exceptions.filter((e) => e.kind === "conflicting");
  assert.equal(conflictingExceptions.length, 1);
  assert.equal(conflictingExceptions[0].facts.length, 2);
});

test("a resolved conflict does not block approval readiness", () => {
  const facts = [draftFact({ id: "1", fieldPath: "daily_life.bathing" })];
  const conflicts: FactConflictForReview[] = [
    { id: "c1", fieldPath: "daily_life.bathing", factADraftId: "1", factBDraftId: "2", status: "resolved" },
  ];
  const summary = computeReviewExceptions(facts, conflicts);
  assert.equal(summary.readyForApproval, true);
});

test("an open conflict blocks readyForApproval", () => {
  const facts = [draftFact({ id: "1", fieldPath: "daily_life.bathing" })];
  const conflicts: FactConflictForReview[] = [
    { id: "c1", fieldPath: "daily_life.bathing", factADraftId: "1", factBDraftId: "2", status: "open" },
  ];
  const summary = computeReviewExceptions(facts, conflicts);
  assert.equal(summary.readyForApproval, false);
});

test("MISSING vs FALSE: a required-for-review field never discussed shows as 'missing_required', never inferred as a negative fact", () => {
  const summary = computeReviewExceptions([], []);
  const missing = summary.exceptions.filter((e) => e.kind === "missing_required");
  assert.ok(missing.length > 0, "expected at least one missing_required exception for required-for-review fields");
  assert.ok(missing.every((e) => e.facts.length === 0), "a missing field must never carry a fabricated fact");
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
