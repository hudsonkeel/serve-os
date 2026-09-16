import assert from "node:assert/strict";
import {
  computeReviewExceptions,
  distinctFactValues,
  isConflictResolutionComplete,
  type DraftFactForReview,
  type FactConflictForReview,
  type ReviewException,
} from "../reviewExceptions.ts";

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

function conflict(
  overrides: Partial<FactConflictForReview> & { id: string; fieldPath: string; factADraftId: string }
): FactConflictForReview {
  return {
    factBDraftId: null,
    status: "open",
    resolvedFactId: null,
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
  const conflicts = [conflict({ id: "c1", fieldPath: "mobility_safety.recent_falls", factADraftId: "1", factBDraftId: "2" })];
  const summary = computeReviewExceptions(facts, conflicts);
  const conflictingExceptions = summary.exceptions.filter((e) => e.kind === "conflicting");
  assert.equal(conflictingExceptions.length, 1);
  assert.equal(conflictingExceptions[0].facts.length, 2);
});

test("a resolved conflict does not block approval readiness", () => {
  const facts = [draftFact({ id: "1", fieldPath: "daily_life.bathing" })];
  const conflicts = [
    conflict({ id: "c1", fieldPath: "daily_life.bathing", factADraftId: "1", factBDraftId: "2", status: "resolved", resolvedFactId: "1" }),
  ];
  const summary = computeReviewExceptions(facts, conflicts);
  assert.equal(summary.readyForApproval, true);
});

test("an open conflict blocks readyForApproval", () => {
  const facts = [draftFact({ id: "1", fieldPath: "daily_life.bathing" })];
  const conflicts = [conflict({ id: "c1", fieldPath: "daily_life.bathing", factADraftId: "1", factBDraftId: "2" })];
  const summary = computeReviewExceptions(facts, conflicts);
  assert.equal(summary.readyForApproval, false);
});

test("MISSING vs FALSE: a required-for-review field never discussed shows as 'missing_required', never inferred as a negative fact", () => {
  const summary = computeReviewExceptions([], []);
  const missing = summary.exceptions.filter((e) => e.kind === "missing_required");
  assert.ok(missing.length > 0, "expected at least one missing_required exception for required-for-review fields");
  assert.ok(missing.every((e) => e.facts.length === 0), "a missing field must never carry a fabricated fact");
});

test("a resolved conflict keeps surfacing as a 'conflicting' exception (not silently vanishing) so the rejected value never falls through to auto-accepted clearFacts alongside the winning one", () => {
  const facts = [
    draftFact({ id: "1", fieldPath: "important_people.physician_name", value: "Dr. Smith" }),
    draftFact({ id: "2", fieldPath: "important_people.physician_name", value: "Dr. Jones" }),
  ];
  const conflicts = [
    conflict({
      id: "c1",
      fieldPath: "important_people.physician_name",
      factADraftId: "1",
      factBDraftId: "2",
      status: "resolved",
      resolvedFactId: "1",
    }),
  ];
  const summary = computeReviewExceptions(facts, conflicts);
  const conflictingExceptions = summary.exceptions.filter((e) => e.kind === "conflicting");
  assert.equal(conflictingExceptions.length, 1);
  assert.equal(conflictingExceptions[0].resolvedFactId, "1");
  assert.equal(summary.clearFacts.length, 0, "neither conflicting fact should fall through to clearFacts, resolved or not");
});

test("a model-self-flagged conflict, once persisted as a singleton conflict row (factBDraftId null), surfaces as a 'conflicting' exception exactly like a paired one", () => {
  const facts = [draftFact({ id: "1", fieldPath: "important_people.physician_name", assertionState: "conflicting", value: "unclear" })];
  const conflicts = [conflict({ id: "c1", fieldPath: "important_people.physician_name", factADraftId: "1", factBDraftId: null })];
  const summary = computeReviewExceptions(facts, conflicts);
  const conflictingExceptions = summary.exceptions.filter((e) => e.kind === "conflicting");
  assert.equal(conflictingExceptions.length, 1);
  assert.equal(conflictingExceptions[0].fieldPath, "important_people.physician_name");
});

test("a field_path with two separate conflict rows is only durably resolved once BOTH are resolved", () => {
  const facts = [
    draftFact({ id: "1", fieldPath: "important_people.physician_name", value: "Dr. Smith" }),
    draftFact({ id: "2", fieldPath: "important_people.physician_name", value: "Dr. Jones" }),
    draftFact({ id: "3", fieldPath: "important_people.physician_name", assertionState: "conflicting", value: "unclear" }),
  ];
  const conflicts = [
    conflict({ id: "c1", fieldPath: "important_people.physician_name", factADraftId: "1", factBDraftId: "2", status: "resolved", resolvedFactId: "1" }),
    conflict({ id: "c2", fieldPath: "important_people.physician_name", factADraftId: "3", factBDraftId: null }), // still open
  ];
  const summary = computeReviewExceptions(facts, conflicts);
  const conflictingExceptions = summary.exceptions.filter((e) => e.kind === "conflicting");
  assert.equal(conflictingExceptions.length, 1);
  assert.equal(conflictingExceptions[0].resolvedFactId, null, "one resolved conflict row out of two isn't enough — the field isn't settled yet");
});

test("distinctFactValues: dedupes facts sharing the same value down to one entry", () => {
  const facts: DraftFactForReview[] = [
    draftFact({ id: "1", fieldPath: "important_people.physician_name", value: "Dr. Smith", reporter: "resident" }),
    draftFact({ id: "2", fieldPath: "important_people.physician_name", value: "Dr. Smith", reporter: "daughter" }),
  ];
  const distinct = distinctFactValues(facts);
  assert.equal(distinct.length, 1);
  assert.equal(distinct[0].value, "Dr. Smith");
});

test("distinctFactValues: keeps one entry per genuinely distinct value, first-seen order", () => {
  const facts: DraftFactForReview[] = [
    draftFact({ id: "1", fieldPath: "important_people.physician_name", value: "Dr. Smith" }),
    draftFact({ id: "2", fieldPath: "important_people.physician_name", value: "Dr. Jones" }),
  ];
  const distinct = distinctFactValues(facts);
  assert.equal(distinct.length, 2);
  assert.deepEqual(distinct.map((d) => d.factId), ["1", "2"]);
});

function conflictingException(overrides: Partial<ReviewException> = {}): ReviewException {
  return {
    kind: "conflicting",
    fieldPath: "important_people.physician_name",
    label: "Physician name",
    facts: [],
    resolvedFactId: null,
    ...overrides,
  };
}

test("isConflictResolutionComplete: false with no resolution picked and no durable resolution", () => {
  assert.equal(isConflictResolutionComplete([conflictingException()], {}), false);
});

test("isConflictResolutionComplete: a 'leave_uncertain' / 'neither, needs follow-up' pick does NOT satisfy it — a conflict is a data-integrity exception, not a mere unknown", () => {
  assert.equal(
    isConflictResolutionComplete([conflictingException()], { "important_people.physician_name": "leave_uncertain" }),
    false
  );
});

test("isConflictResolutionComplete: true once a specific value has been picked this session ('fact:<id>')", () => {
  assert.equal(
    isConflictResolutionComplete([conflictingException()], { "important_people.physician_name": "fact:1" }),
    true
  );
});

test("isConflictResolutionComplete: true when durably resolved (exception.resolvedFactId set), even with no local resolution entry at all — this is what survives reload/another session", () => {
  const exception = conflictingException({ resolvedFactId: "1" });
  assert.equal(isConflictResolutionComplete([exception], {}), true);
});

test("isConflictResolutionComplete: vacuously true with no conflicting exceptions at all", () => {
  assert.equal(isConflictResolutionComplete([], {}), true);
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
