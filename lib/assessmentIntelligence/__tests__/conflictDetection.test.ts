import assert from "node:assert/strict";
import { findConflictingFactPairs, findSelfFlaggedConflicts, type ConflictCandidateFact } from "../conflictDetection.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function fact(overrides: Partial<ConflictCandidateFact> & { id: string; field_path: string }): ConflictCandidateFact {
  return { assertion_state: "confirmed_yes", value: true, ...overrides };
}

test("confirmed_yes vs confirmed_no on the same field_path: pairs (existing behavior, unchanged)", () => {
  const facts = [
    fact({ id: "1", field_path: "mobility_safety.recent_falls", assertion_state: "confirmed_yes" }),
    fact({ id: "2", field_path: "mobility_safety.recent_falls", assertion_state: "confirmed_no" }),
  ];
  const pairs = findConflictingFactPairs(facts);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].fieldPath, "mobility_safety.recent_falls");
  assert.deepEqual([pairs[0].factAId, pairs[0].factBId].sort(), ["1", "2"]);
});

test("two confirmed_yes with the SAME value on a non-boolean field: not a conflict, just corroboration", () => {
  const facts = [
    fact({ id: "1", field_path: "important_people.physician_name", value: "Dr. Smith" }),
    fact({ id: "2", field_path: "important_people.physician_name", value: "Dr. Smith" }),
  ];
  const pairs = findConflictingFactPairs(facts);
  assert.equal(pairs.length, 0);
});

test("two confirmed_yes with DIFFERENT values on a non-boolean field: pairs (the fix — two different physician names)", () => {
  const facts = [
    fact({ id: "1", field_path: "important_people.physician_name", value: "Dr. Smith" }),
    fact({ id: "2", field_path: "important_people.physician_name", value: "Dr. Jones" }),
  ];
  const pairs = findConflictingFactPairs(facts);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].fieldPath, "important_people.physician_name");
  assert.deepEqual([pairs[0].factAId, pairs[0].factBId].sort(), ["1", "2"]);
});

test("two confirmed_no with different values on a non-boolean field: also pairs", () => {
  const facts = [
    fact({ id: "1", field_path: "health.dietary_restrictions", assertion_state: "confirmed_no", value: "none" }),
    fact({ id: "2", field_path: "health.dietary_restrictions", assertion_state: "confirmed_no", value: "low sodium" }),
  ];
  const pairs = findConflictingFactPairs(facts);
  assert.equal(pairs.length, 1);
});

test("two confirmed_yes on a BOOLEAN field never conflict via the same-polarity rule (their values are always equal)", () => {
  const facts = [
    fact({ id: "1", field_path: "daily_life.bathing", assertion_state: "confirmed_yes", value: true }),
    fact({ id: "2", field_path: "daily_life.bathing", assertion_state: "confirmed_yes", value: true }),
  ];
  const pairs = findConflictingFactPairs(facts);
  assert.equal(pairs.length, 0);
});

test("a single fact for a field_path: nothing to pair against, no conflict", () => {
  const facts = [fact({ id: "1", field_path: "important_people.physician_name", value: "Dr. Smith" })];
  const pairs = findConflictingFactPairs(facts);
  assert.equal(pairs.length, 0);
});

test("uncertain and not_applicable facts never participate in pairing", () => {
  const facts = [
    fact({ id: "1", field_path: "important_people.physician_name", assertion_state: "uncertain", value: "Dr. Smith" }),
    fact({ id: "2", field_path: "important_people.physician_name", assertion_state: "not_applicable", value: null }),
  ];
  const pairs = findConflictingFactPairs(facts);
  assert.equal(pairs.length, 0);
});

test("a self-flagged 'conflicting' fact never participates in pairing (handled separately, not by this pairing function)", () => {
  const facts = [
    fact({ id: "1", field_path: "important_people.physician_name", assertion_state: "conflicting", value: "unclear" }),
    fact({ id: "2", field_path: "important_people.physician_name", assertion_state: "confirmed_yes", value: "Dr. Smith" }),
  ];
  const pairs = findConflictingFactPairs(facts);
  assert.equal(pairs.length, 0);
});

test("findSelfFlaggedConflicts: identifies each fact whose own assertion_state is 'conflicting'", () => {
  const facts = [
    fact({ id: "1", field_path: "important_people.physician_name", assertion_state: "conflicting", value: "unclear" }),
    fact({ id: "2", field_path: "daily_life.bathing", assertion_state: "confirmed_yes", value: true }),
  ];
  const flagged = findSelfFlaggedConflicts(facts);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].fieldPath, "important_people.physician_name");
  assert.equal(flagged[0].factId, "1");
});

test("findSelfFlaggedConflicts: none when nothing is self-flagged", () => {
  const facts = [fact({ id: "1", field_path: "daily_life.bathing", assertion_state: "confirmed_yes" })];
  assert.equal(findSelfFlaggedConflicts(facts).length, 0);
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
