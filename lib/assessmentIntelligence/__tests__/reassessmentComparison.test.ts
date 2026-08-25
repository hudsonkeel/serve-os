import assert from "node:assert/strict";
import { compareReassessment, type ExistingApprovedFactForComparison, type NewDraftFactForComparison } from "../reassessmentComparison.ts";
import { FIXTURE_B_EXISTING_APPROVED_FACTS, FIXTURE_B_EXPECTED_CLASSIFICATION } from "../__fixtures__/syntheticAssessments.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function classificationOf(rows: ReturnType<typeof compareReassessment>, fieldPath: string) {
  const row = rows.find((r) => r.fieldPath === fieldPath);
  assert.ok(row, `no comparison row for ${fieldPath}`);
  return row!;
}

// ── Fixture B, end-to-end: existing approved facts + a hand-constructed "what the reassessment
// transcript would plausibly extract" set, asserting against the fixture's own hand-authored
// expected classification. This exercises the real comparator against the real fixture, not a
// synthetic toy case.

const EXISTING: ExistingApprovedFactForComparison[] = FIXTURE_B_EXISTING_APPROVED_FACTS.map((f) => ({
  fieldPath: f.fieldPath,
  assertionState: f.assertionState,
  value: f.value,
}));

const NEW_DRAFT_FACTS: NewDraftFactForComparison[] = [
  // bathing: same boolean, worse degree in evidence text -> UNCHANGED (known limitation: a plain
  // boolean can't represent a severity change, see fixture file comments)
  { fieldPath: "daily_life.bathing", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "can't stand on his own in the shower at all, needs physical assistance" },
  // medication_reminders: clean flip -> CHANGED_FACT
  { fieldPath: "daily_life.medication_reminders", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "missed doses twice, needs reminders morning and evening" },
  // toileting: clean flip -> CHANGED_FACT
  { fieldPath: "daily_life.toileting", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "needs help getting on and off the toilet safely now" },
  // walker: reconfirmed identically -> UNCHANGED
  { fieldPath: "mobility_safety.walker", assertionState: "confirmed_yes", value: true, reporter: "son", evidence: "still uses it every time he gets up" },
  // companionship_social: reconfirmed identically -> UNCHANGED
  { fieldPath: "daily_life.companionship_social", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "lights up whenever someone's here to talk" },
  // cognition.short_term_memory_change: brand new -> NEW_FACT
  { fieldPath: "cognition.short_term_memory_change", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "asks the same question three or four times in one visit" },
  // recent_falls: two reporters disagree -> CONFLICTING_FACT
  { fieldPath: "mobility_safety.recent_falls", assertionState: "confirmed_yes", value: true, reporter: "daughter", evidence: "almost went down in the kitchen last week" },
  { fieldPath: "mobility_safety.recent_falls", assertionState: "confirmed_no", value: false, reporter: "son", evidence: "he told me he hasn't fallen at all" },
  // primary_contact_name and health.allergies: intentionally absent -> NOT_DISCUSSED
];

test("Fixture B end-to-end matches every hand-authored expected classification", () => {
  const rows = compareReassessment(EXISTING, NEW_DRAFT_FACTS);
  for (const expected of FIXTURE_B_EXPECTED_CLASSIFICATION) {
    const row = classificationOf(rows, expected.fieldPath);
    assert.equal(row.classification, expected.classification, `${expected.fieldPath}: expected ${expected.classification}, got ${row.classification}`);
  }
});

test("NOT_DISCUSSED rows preserve the existing value verbatim as the proposed value", () => {
  const rows = compareReassessment(EXISTING, NEW_DRAFT_FACTS);
  const contact = classificationOf(rows, "important_people.primary_contact_name");
  assert.equal(contact.classification, "NOT_DISCUSSED");
  assert.equal(contact.proposedNewValue, "Susan Higby");
  assert.equal(contact.proposedDownstreamAction, "none");

  const allergies = classificationOf(rows, "health.allergies");
  assert.equal(allergies.classification, "NOT_DISCUSSED");
  assert.equal(allergies.proposedNewValue, "Penicillin");
});

test("CONFLICTING_FACT never overwrites the prior confirmed_no baseline, from either side", () => {
  const rows = compareReassessment(EXISTING, NEW_DRAFT_FACTS);
  const falls = classificationOf(rows, "mobility_safety.recent_falls");
  assert.equal(falls.classification, "CONFLICTING_FACT");
  assert.equal(falls.proposedNewAssertionState, "confirmed_no", "must stay at the existing baseline, not silently flip to either reporter's claim");
  assert.equal(falls.proposedDownstreamAction, "none");
});

test("CHANGED_FACT proposes the new value and marks it for downstream action", () => {
  const rows = compareReassessment(EXISTING, NEW_DRAFT_FACTS);
  const meds = classificationOf(rows, "daily_life.medication_reminders");
  assert.equal(meds.classification, "CHANGED_FACT");
  assert.equal(meds.proposedNewAssertionState, "confirmed_yes");
  assert.equal(meds.proposedDownstreamAction, "propose_update");
});

test("NEW_FACT has no prior baseline and proposes the new value", () => {
  const rows = compareReassessment(EXISTING, NEW_DRAFT_FACTS);
  const memory = classificationOf(rows, "cognition.short_term_memory_change");
  assert.equal(memory.classification, "NEW_FACT");
  assert.equal(memory.currentApprovedValue, null);
  assert.equal(memory.proposedDownstreamAction, "propose_update");
});

// ── Focused unit tests for rules not exercised (or not exercised sharply enough) by Fixture B.

test("RULE: uncertainty never overwrites a confirmed existing fact", () => {
  const existing: ExistingApprovedFactForComparison[] = [{ fieldPath: "daily_life.toileting", assertionState: "confirmed_no", value: false }];
  const newFacts: NewDraftFactForComparison[] = [
    { fieldPath: "daily_life.toileting", assertionState: "uncertain", value: null, reporter: "son", evidence: "not totally sure, maybe some trouble lately" },
  ];
  const rows = compareReassessment(existing, newFacts);
  const row = classificationOf(rows, "daily_life.toileting");
  assert.equal(row.classification, "REQUIRES_REVIEW");
  assert.equal(row.proposedNewAssertionState, "confirmed_no", "uncertainty must not silently replace the confirmed baseline");
  assert.equal(row.proposedDownstreamAction, "none");
});

test("RULE: identity-sensitive field changing is REQUIRES_REVIEW, never a plain CHANGED_FACT, even with clean single-reporter evidence", () => {
  const existing: ExistingApprovedFactForComparison[] = [{ fieldPath: "important_people.decision_maker", assertionState: "confirmed_yes", value: "Susan Higby" }];
  const newFacts: NewDraftFactForComparison[] = [
    { fieldPath: "important_people.decision_maker", assertionState: "confirmed_yes", value: "Michael Higby", reporter: "son", evidence: "I'm handling everything for him now" },
  ];
  const rows = compareReassessment(existing, newFacts);
  const row = classificationOf(rows, "important_people.decision_maker");
  assert.equal(row.classification, "REQUIRES_REVIEW");
  assert.equal(row.proposedDownstreamAction, "none");
});

test("RULE: a field with neither an existing value nor a new mention never appears in the output at all", () => {
  const rows = compareReassessment(
    [{ fieldPath: "daily_life.bathing", assertionState: "confirmed_yes", value: true }],
    [{ fieldPath: "daily_life.bathing", assertionState: "confirmed_yes", value: true, reporter: "x", evidence: "y" }]
  );
  assert.equal(rows.find((r) => r.fieldPath === "advance_planning.dnr"), undefined);
});

test("A NOT_APPLICABLE reconfirmation counts as UNCHANGED, not a difference", () => {
  const existing: ExistingApprovedFactForComparison[] = [{ fieldPath: "mobility_safety.wheelchair", assertionState: "not_applicable", value: null }];
  const newFacts: NewDraftFactForComparison[] = [
    { fieldPath: "mobility_safety.wheelchair", assertionState: "not_applicable", value: null, reporter: "daughter", evidence: "still not applicable, he walks fine" },
  ];
  const rows = compareReassessment(existing, newFacts);
  assert.equal(classificationOf(rows, "mobility_safety.wheelchair").classification, "UNCHANGED");
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
