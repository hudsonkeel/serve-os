import assert from "node:assert/strict";
import { normalizeExtractedFacts } from "../factTypes.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("accepts a well-formed confirmed_yes fact with evidence", () => {
  const result = normalizeExtractedFacts([
    {
      field_path: "daily_life.bathing",
      value: true,
      assertion_state: "confirmed_yes",
      collection_method: "reported",
      reporter: "daughter",
      evidence: "She needs help getting in and out of the shower.",
      confidence: "high",
    },
  ]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.accepted[0].fieldPath, "daily_life.bathing");
  assert.equal(result.accepted[0].domain, "daily_life");
});

test("rejects an unknown field_path not in the domain registry", () => {
  const result = normalizeExtractedFacts([
    {
      field_path: "made_up.not_a_real_field",
      value: true,
      assertion_state: "confirmed_yes",
      collection_method: "reported",
      reporter: "resident",
      evidence: "some evidence",
      confidence: "high",
    },
  ]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /Unknown field_path/);
});

test("UNKNOWN != FALSE — rejects an affirmative claim with confidence 'none' rather than let it become an operational fact", () => {
  const result = normalizeExtractedFacts([
    {
      field_path: "mobility_safety.recent_falls",
      value: false,
      assertion_state: "confirmed_no",
      collection_method: null,
      reporter: null,
      evidence: null,
      confidence: "none",
    },
  ]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /refusing to let an unknown become/);
});

test("a topic never discussed produces no row at all — normalizeExtractedFacts only ever processes what was actually submitted", () => {
  const result = normalizeExtractedFacts([]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 0);
});

test("rejects a reported claim with no evidence quote", () => {
  const result = normalizeExtractedFacts([
    {
      field_path: "cognition.wandering",
      value: true,
      assertion_state: "confirmed_yes",
      collection_method: "reported",
      reporter: "resident",
      evidence: null,
      confidence: "medium",
    },
  ]);
  assert.equal(result.accepted.length, 0);
  assert.match(result.rejected[0].reason, /requires some evidence/);
});

test("accepts an 'uncertain' fact even with low confidence — uncertainty is a legitimate, distinct state, not rejected", () => {
  const result = normalizeExtractedFacts([
    {
      field_path: "mobility_safety.walker",
      value: true,
      assertion_state: "uncertain",
      collection_method: "reported",
      reporter: "daughter",
      evidence: "I think she still has her old walker somewhere.",
      confidence: "low",
    },
  ]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].assertionState, "uncertain");
});

test("observed vs reported are independent of assertion_state — both combinations are valid", () => {
  const result = normalizeExtractedFacts([
    {
      field_path: "mobility_safety.walker",
      value: true,
      assertion_state: "confirmed_yes",
      collection_method: "observed",
      reporter: "assessor",
      evidence: "Assessor saw the resident using a walker during the visit.",
      confidence: "high",
    },
    {
      field_path: "vision_hearing.hearing_aids",
      value: true,
      assertion_state: "confirmed_yes",
      collection_method: "reported",
      reporter: "resident",
      evidence: "Resident said she wears hearing aids.",
      confidence: "high",
    },
  ]);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.accepted[0].collectionMethod, "observed");
  assert.equal(result.accepted[1].collectionMethod, "reported");
});

test("rejects malformed input that fails schema validation entirely", () => {
  const result = normalizeExtractedFacts([{ field_path: "daily_life.bathing", assertion_state: "not_a_real_state" }]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /Schema validation failed/);
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
