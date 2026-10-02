import assert from "node:assert/strict";
import {
  computeReviewExceptions,
  distinctFactValues,
  isExceptionDispositioned,
  getDispositionableExceptions,
  isReviewReadyForApproval,
  buildApprovedFactsForReview,
  hasExtractedAssessmentContent,
  needsAttentionCount,
  NO_EXTRACTED_ASSESSMENT_INFORMATION_MESSAGE,
  type DraftFactForReview,
  type FactConflictForReview,
  type ReviewException,
} from "../reviewExceptions.ts";
import { computeAssessmentCoverage, buildCanonicalCoverageFacts } from "../coverage.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

// ─── isReviewReadyForApproval — the actual Approve-button gate, not just its building block
// (2026-09-17, Slice A follow-up: fixes the adjacent "Not discussed" projection defect). This is
// the exact computation AssessmentReviewPanel.tsx's `canApprove` calls, tested directly so the
// gate itself -- not only isExceptionDispositioned() in isolation -- is proven correct. ─────────

test("getDispositionableExceptions: only conflicting and uncertain kinds require a disposition -- missing_required is surfaced but never gates approval", () => {
  const exceptions: ReviewException[] = [
    conflictingException({ fieldPath: "field.a" }),
    uncertainException({ fieldPath: "field.b" }),
    { kind: "missing_required", fieldPath: "field.c", label: "Field C", facts: [], resolvedFactId: null },
  ];
  const dispositionable = getDispositionableExceptions(exceptions);
  assert.deepEqual(dispositionable.map((e) => e.fieldPath).sort(), ["field.a", "field.b"]);
});

test("conflict + Confirm Yes (a boolean conflict's 'fact:<id>' pick): dispositioned, approval allowed", () => {
  const clearFacts = [draftFact({ id: "clear", fieldPath: "daily_life.bathing" })];
  const exceptions = [conflictingException({ fieldPath: "cognition.short_term_memory_change" })];
  const resolutions = { "cognition.short_term_memory_change": "fact:1" };
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, resolutions), true);
});

test("conflict + Confirm No (the other boolean pick): dispositioned, approval allowed", () => {
  const clearFacts = [draftFact({ id: "clear", fieldPath: "daily_life.bathing" })];
  const exceptions = [conflictingException({ fieldPath: "cognition.short_term_memory_change" })];
  const resolutions = { "cognition.short_term_memory_change": "fact:2" };
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, resolutions), true);
});

test("conflict + Neither / needs follow-up: dispositioned, approval allowed, even though no definitive value was picked", () => {
  const clearFacts = [draftFact({ id: "clear", fieldPath: "daily_life.bathing" })];
  const exceptions = [conflictingException({ fieldPath: "cognition.short_term_memory_change" })];
  const resolutions = { "cognition.short_term_memory_change": "leave_uncertain" };
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, resolutions), true);
});

test("uncertain + Leave Unknown: dispositioned, approval allowed", () => {
  const clearFacts = [draftFact({ id: "clear", fieldPath: "daily_life.bathing" })];
  const exceptions = [uncertainException({ fieldPath: "daily_life.laundry" })];
  const resolutions = { "daily_life.laundry": "leave_uncertain" };
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, resolutions), true);
});

test("an exception with no disposition at all blocks approval", () => {
  const clearFacts = [draftFact({ id: "clear", fieldPath: "daily_life.bathing" })];
  const exceptions = [uncertainException({ fieldPath: "important_people.physician_phone" })];
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, {}), false);
});

test("mixed exceptions where every one has an explicit disposition, including 'needs follow-up' and 'leave unknown': approval allowed", () => {
  const clearFacts = [draftFact({ id: "clear", fieldPath: "daily_life.bathing" })];
  const exceptions = [
    conflictingException({ fieldPath: "cognition.short_term_memory_change" }),
    uncertainException({ fieldPath: "daily_life.laundry" }),
    uncertainException({ fieldPath: "important_people.physician_phone" }),
  ];
  const resolutions = {
    "cognition.short_term_memory_change": "leave_uncertain",
    "daily_life.laundry": "leave_uncertain",
    "important_people.physician_phone": "confirmed_no",
  };
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, resolutions), true);
});

test("mixed exceptions where one of several has no disposition: approval blocked", () => {
  const clearFacts = [draftFact({ id: "clear", fieldPath: "daily_life.bathing" })];
  const exceptions = [
    conflictingException({ fieldPath: "cognition.short_term_memory_change" }),
    uncertainException({ fieldPath: "daily_life.laundry" }),
    uncertainException({ fieldPath: "important_people.physician_phone" }), // never touched
  ];
  const resolutions = {
    "cognition.short_term_memory_change": "leave_uncertain",
    "daily_life.laundry": "confirmed_yes",
  };
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, resolutions), false);
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

// ─── Zero-fact approval guard + Needs Attention count (2026-10-02, Test #1 follow-up) ────────

const allRequiredMissing = (): ReviewException[] => computeReviewExceptions([], []).exceptions;

test("ZERO FACTS: computeReviewExceptions yields only missing_required placeholders (Test #1 shape: 7)", () => {
  const exceptions = allRequiredMissing();
  assert.ok(exceptions.length > 0);
  assert.ok(exceptions.every((e) => e.kind === "missing_required"));
});

test("ZERO FACTS: missing_required placeholders are NOT extracted content — approval is unavailable", () => {
  const exceptions = allRequiredMissing();
  assert.equal(hasExtractedAssessmentContent([], exceptions), false);
  assert.equal(isReviewReadyForApproval([], exceptions, {}), false);
  // even if someone recorded dispositions for placeholder paths, nothing becomes approvable
  const resolutions = Object.fromEntries(exceptions.map((e) => [e.fieldPath, "leave_uncertain"]));
  assert.equal(isReviewReadyForApproval([], exceptions, resolutions), false);
});

test("Needs Attention count excludes hidden missing_required placeholders (Test #1: 7 → 0)", () => {
  assert.equal(needsAttentionCount(allRequiredMissing()), 0);
  const mixed: ReviewException[] = [
    conflictingException({ fieldPath: "field.a" }),
    uncertainException({ fieldPath: "field.b" }),
    ...allRequiredMissing(),
  ];
  assert.equal(needsAttentionCount(mixed), 2);
});

test("genuine content: an uncertain fact alone (no clear facts) IS content, and still requires disposition", () => {
  const exceptions = [uncertainException({ fieldPath: "daily_life.laundry" }), ...allRequiredMissing()];
  assert.equal(hasExtractedAssessmentContent([], exceptions), true);
  assert.equal(isReviewReadyForApproval([], exceptions, {}), false, "undispositioned uncertainty blocks");
  assert.equal(isReviewReadyForApproval([], exceptions, { "daily_life.laundry": "leave_uncertain" }), true, "Leave Unknown is a valid disposition");
});

test("genuine content: a conflict alone is content; 'Needs follow-up' (leave_uncertain) remains a valid disposition", () => {
  const exceptions = [conflictingException({ fieldPath: "cognition.short_term_memory_change" })];
  assert.equal(isReviewReadyForApproval([], exceptions, {}), false);
  assert.equal(isReviewReadyForApproval([], exceptions, { "cognition.short_term_memory_change": "leave_uncertain" }), true);
});

test("populated assessment with missing_required placeholders still becomes approvable once real exceptions are dispositioned", () => {
  const clearFacts = [draftFact({ id: "c1", fieldPath: "daily_life.bathing" })];
  const exceptions = [uncertainException({ fieldPath: "daily_life.laundry" }), ...allRequiredMissing()];
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, {}), false);
  assert.equal(isReviewReadyForApproval(clearFacts, exceptions, { "daily_life.laundry": "confirmed_no" }), true);
  assert.equal(isReviewReadyForApproval(clearFacts, allRequiredMissing(), {}), true, "clear facts + placeholders only: approvable (placeholders never gate)");
});

test("coverage remains independent: the zero-fact Test #1 shape still reports 33 informational topics", () => {
  const canonical = buildCanonicalCoverageFacts({
    dateOfBirth: "1940-01-01", phone: "555", communityId: "c", addressLine1: null, city: null, state: null, postalCode: null,
    physicianName: null, physicianPhone: null, primaryContactName: null,
  });
  const coverage = computeAssessmentCoverage([], canonical);
  assert.equal(coverage.missingTopics.length, 33);
  assert.match(coverage.summary ?? "", /33 important topics still need clarification/);
  assert.equal(needsAttentionCount(allRequiredMissing()), 0, "coverage never feeds the Needs Attention count");
});

test("STATIC: the review panel shows the zero-fact state, counts only dispositionable items, and the server action refuses zero-fact approval", () => {
  const code = (rel: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", rel), "utf8");
  const panel = code("components/assessment/AssessmentReviewPanel.tsx");
  assert.match(panel, /if \(!approved && !hasExtractedAssessmentContent\(clearFacts, exceptions\)\) \{/);
  assert.match(panel, /\{NO_EXTRACTED_ASSESSMENT_INFORMATION_MESSAGE\}/);
  assert.match(panel, /Needs Attention \(\{attentionCount\}\)/);
  assert.match(panel, /Needs Your Attention \(\{attentionCount\}\)/);
  assert.ok(!/Needs (Your )?Attention \(\{exceptions\.length\}\)/.test(panel));
  const action = code("lib/actions/assessmentIntelligence.ts");
  assert.match(action, /const draftFactsForApproval = await getDraftFactsForSession\(input\.assessmentSessionId\);\s*if \(draftFactsForApproval\.length === 0\)/);
  assert.equal(NO_EXTRACTED_ASSESSMENT_INFORMATION_MESSAGE, "No assessment information was extracted from this recording.");
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
