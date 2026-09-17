import assert from "node:assert/strict";
import {
  computeReviewExceptions,
  distinctFactValues,
  isExceptionDispositioned,
  buildApprovedFactsForReview,
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

function uncertainException(overrides: Partial<ReviewException> = {}): ReviewException {
  return {
    kind: "uncertain",
    fieldPath: "cognition.short_term_memory_change",
    label: "Short-term memory change",
    facts: [],
    resolvedFactId: null,
    ...overrides,
  };
}

// ─── isExceptionDispositioned — the approval gate's actual question (2026-09-17): has the
// reviewer recorded ANY explicit disposition, independent of exception kind and independent of
// whether that disposition contributes an approved fact. Replaces the old, kind-specific
// isConflictResolutionComplete(), which wrongly treated "leave_uncertain" as an incomplete
// review — a business-rule correction, not a restored bug. ─────────────────────────────────────

test("isExceptionDispositioned: false with no resolution picked and no durable resolution — never looked at", () => {
  assert.equal(isExceptionDispositioned(conflictingException(), {}), false);
});

test("untouched uncertain exception blocks approval — no resolution entry at all is not a disposition", () => {
  assert.equal(isExceptionDispositioned(uncertainException(), {}), false);
});

test("conflict + Neither / needs follow-up counts as reviewed — a deliberate human decision, not a missing review", () => {
  assert.equal(
    isExceptionDispositioned(conflictingException(), { "important_people.physician_name": "leave_uncertain" }),
    true
  );
});

test("uncertain + Leave Unknown counts as reviewed — same deliberate-non-assertion semantics as conflict Neither", () => {
  assert.equal(
    isExceptionDispositioned(uncertainException(), { "cognition.short_term_memory_change": "leave_uncertain" }),
    true
  );
});

test("uncertain + Confirm Yes counts as reviewed", () => {
  assert.equal(
    isExceptionDispositioned(uncertainException(), { "cognition.short_term_memory_change": "confirmed_yes" }),
    true
  );
});

test("uncertain + Confirm No counts as reviewed", () => {
  assert.equal(
    isExceptionDispositioned(uncertainException(), { "cognition.short_term_memory_change": "confirmed_no" }),
    true
  );
});

test("isExceptionDispositioned: true once a specific value has been picked this session ('fact:<id>')", () => {
  assert.equal(
    isExceptionDispositioned(conflictingException(), { "important_people.physician_name": "fact:1" }),
    true
  );
});

test("isExceptionDispositioned: true when durably resolved (exception.resolvedFactId set), even with no local resolution entry at all — this is what survives reload/another session", () => {
  const exception = conflictingException({ resolvedFactId: "1" });
  assert.equal(isExceptionDispositioned(exception, {}), true);
});

test("mixed conflict + uncertain set: every exception must be dispositioned, not just some", () => {
  const dispositioned = [
    conflictingException({ fieldPath: "field.a" }),
    uncertainException({ fieldPath: "field.b" }),
  ];
  const resolutionsAllDispositioned = { "field.a": "leave_uncertain", "field.b": "confirmed_no" };
  assert.equal(
    dispositioned.every((e) => isExceptionDispositioned(e, resolutionsAllDispositioned)),
    true
  );

  const resolutionsOneMissing = { "field.a": "leave_uncertain" }; // field.b never touched
  assert.equal(
    dispositioned.every((e) => isExceptionDispositioned(e, resolutionsOneMissing)),
    false
  );
});

// ─── buildApprovedFactsForReview — the shared preview/approval source of truth (2026-09-17) ───

test("buildApprovedFactsForReview: every clear fact approves as-is, with its own source_draft_fact_id", () => {
  const clearFacts = [draftFact({ id: "1", fieldPath: "daily_life.bathing", value: true })];
  const approved = buildApprovedFactsForReview(clearFacts, [], {});
  assert.equal(approved.length, 1);
  assert.equal(approved[0].field_path, "daily_life.bathing");
  assert.equal(approved[0].source_draft_fact_id, "1");
});

test("buildApprovedFactsForReview: an uncertain exception with no resolution picked contributes nothing — stays unknown, not silently approved", () => {
  const exception: ReviewException = {
    kind: "uncertain",
    fieldPath: "cognition.short_term_memory_change",
    label: "Short-term memory change",
    facts: [draftFact({ id: "1", fieldPath: "cognition.short_term_memory_change", assertionState: "uncertain" })],
    resolvedFactId: null,
  };
  const approved = buildApprovedFactsForReview([], [exception], {});
  assert.equal(approved.length, 0);
});

test("buildApprovedFactsForReview: an uncertain exception resolved to confirmed_yes approves as a reviewer-attributed boolean true", () => {
  const exception: ReviewException = {
    kind: "uncertain",
    fieldPath: "cognition.short_term_memory_change",
    label: "Short-term memory change",
    facts: [draftFact({ id: "1", fieldPath: "cognition.short_term_memory_change", assertionState: "uncertain" })],
    resolvedFactId: null,
  };
  const approved = buildApprovedFactsForReview([], [exception], { "cognition.short_term_memory_change": "confirmed_yes" });
  assert.equal(approved.length, 1);
  assert.equal(approved[0].value, true);
  assert.equal(approved[0].assertion_state, "confirmed_yes");
  assert.equal(approved[0].reporter, "reviewer");
});

test("buildApprovedFactsForReview: 'leave_uncertain' contributes nothing, exactly like never having picked anything", () => {
  const exception: ReviewException = {
    kind: "uncertain",
    fieldPath: "cognition.short_term_memory_change",
    label: "Short-term memory change",
    facts: [draftFact({ id: "1", fieldPath: "cognition.short_term_memory_change", assertionState: "uncertain" })],
    resolvedFactId: null,
  };
  const approved = buildApprovedFactsForReview([], [exception], { "cognition.short_term_memory_change": "leave_uncertain" });
  assert.equal(approved.length, 0);
});

test("buildApprovedFactsForReview: a conflicting exception resolved via 'fact:<id>' approves that exact fact's real value/evidence/reporter, never a fabricated one", () => {
  const exception: ReviewException = {
    kind: "conflicting",
    fieldPath: "important_people.physician_name",
    label: "Physician name",
    facts: [
      draftFact({ id: "1", fieldPath: "important_people.physician_name", value: "Dr. Smith", reporter: "resident" }),
      draftFact({ id: "2", fieldPath: "important_people.physician_name", value: "Dr. Jones", reporter: "daughter" }),
    ],
    resolvedFactId: null,
  };
  const approved = buildApprovedFactsForReview([], [exception], { "important_people.physician_name": "fact:2" });
  assert.equal(approved.length, 1);
  assert.equal(approved[0].value, "Dr. Jones");
  assert.equal(approved[0].reporter, "daughter");
  assert.equal(approved[0].source_draft_fact_id, "2");
});

test("buildApprovedFactsForReview: an unresolved conflicting exception contributes nothing", () => {
  const exception: ReviewException = {
    kind: "conflicting",
    fieldPath: "important_people.physician_name",
    label: "Physician name",
    facts: [
      draftFact({ id: "1", fieldPath: "important_people.physician_name", value: "Dr. Smith" }),
      draftFact({ id: "2", fieldPath: "important_people.physician_name", value: "Dr. Jones" }),
    ],
    resolvedFactId: null,
  };
  const approved = buildApprovedFactsForReview([], [exception], {});
  assert.equal(approved.length, 0);
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
