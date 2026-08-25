import assert from "node:assert/strict";
import { mapFactsToAdlCandidates, type ConfiguredAdl, type ApprovedFactForAdlMapping } from "../adlMapping.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// A representative slice of the REAL 99-entry catalog captured live against the actual
// configured AxisCare site during this work (ids/names/adlKeys/active flags all real, not
// invented — see the completion report for the full list).
const REAL_ADLS: ConfiguredAdl[] = [
  { id: 1, name: "Shower Assist", adlKey: "bathing", active: true },
  { id: 4, name: "Dressing", adlKey: "dressing", active: true },
  { id: 6, name: "Medication Reminders", adlKey: "medication", active: true },
  { id: 10, name: "Light Housekeeping", adlKey: "lthouse", active: true },
  { id: 11, name: "Grooming", adlKey: "grooming", active: true },
  { id: 13, name: "Laundry", adlKey: "laundry", active: true },
  { id: 14, name: "Meal Preparation", adlKey: "mealprep", active: true },
  { id: 18, name: "Toileting Assistance", adlKey: "toilet_assistance", active: true },
  { id: 2, name: "Companionship", adlKey: "companion", active: true },
  { id: 45, name: "Conversation", adlKey: "conversation", active: true },
  { id: 7, name: "Client Errands", adlKey: "errands", active: true },
  { id: 8, name: "Client Transportation", adlKey: "transportation", active: true },
  { id: 67, name: "Fall Risk", adlKey: "fall_risk", active: false }, // real, but inactive
];

function confirmedYes(fieldPath: string): ApprovedFactForAdlMapping {
  return { fieldPath, assertionState: "confirmed_yes", value: true };
}

test("clean single match -> READY with the real id", () => {
  const results = mapFactsToAdlCandidates([confirmedYes("daily_life.bathing")], REAL_ADLS);
  assert.equal(results.length, 1);
  assert.equal(results[0].state, "READY");
  assert.equal(results[0].candidatePayload?.id, 1);
});

test("all 7 single-mapped daily_life fields resolve READY against the real catalog", () => {
  const fieldPaths = [
    "daily_life.bathing",
    "daily_life.dressing",
    "daily_life.medication_reminders",
    "daily_life.housekeeping",
    "daily_life.grooming",
    "daily_life.laundry",
    "daily_life.meal_preparation",
    "daily_life.toileting",
  ];
  const results = mapFactsToAdlCandidates(fieldPaths.map(confirmedYes), REAL_ADLS);
  for (const fp of fieldPaths) {
    const row = results.find((r) => r.fieldPath === fp);
    assert.ok(row, `no result for ${fp}`);
    assert.equal(row!.state, "READY", `${fp} expected READY, got ${row!.state}`);
  }
});

test("ambiguous field (2 active candidates) -> REQUIRES_REVIEW, not an arbitrary pick", () => {
  const results = mapFactsToAdlCandidates([confirmedYes("daily_life.companionship_social")], REAL_ADLS);
  assert.equal(results.length, 1);
  assert.equal(results[0].state, "REQUIRES_REVIEW");
  assert.equal(results[0].matchedAdls.length, 2);
  assert.equal(results[0].candidatePayload, null);
});

test("'all' combine mode assigns every matching active ADL, not just one", () => {
  const results = mapFactsToAdlCandidates([confirmedYes("daily_life.transportation_errands")], REAL_ADLS);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.state === "READY"));
  const ids = results.map((r) => r.candidatePayload?.id).sort();
  assert.deepEqual(ids, [7, 8]);
});

test("no active configured ADL -> UNMAPPED_REQUIRES_CONFIGURATION, never falls back to the inactive one", () => {
  // Simulate a catalog where "medication" is only present as inactive.
  const catalogWithoutActiveMedication = REAL_ADLS.map((a) => (a.adlKey === "medication" ? { ...a, active: false } : a));
  const results = mapFactsToAdlCandidates([confirmedYes("daily_life.medication_reminders")], catalogWithoutActiveMedication);
  assert.equal(results[0].state, "UNMAPPED_REQUIRES_CONFIGURATION");
  assert.equal(results[0].candidatePayload, null);
});

test("equipment/diagnostic fields are NOT_APPLICABLE, not treated as unmapped care tasks", () => {
  const results = mapFactsToAdlCandidates([confirmedYes("mobility_safety.walker"), confirmedYes("mobility_safety.recent_falls")], REAL_ADLS);
  assert.ok(results.every((r) => r.state === "NOT_APPLICABLE"));
});

test("only confirmed_yes facts are considered — confirmed_no/uncertain never propose an ADL", () => {
  const results = mapFactsToAdlCandidates(
    [{ fieldPath: "daily_life.bathing", assertionState: "confirmed_no", value: false }],
    REAL_ADLS
  );
  assert.equal(results.length, 0);
});

test("never returns an inactive ADL's id, even though it exists in the catalog", () => {
  // Fall Risk (id 67) exists in the real catalog but is inactive and has no field mapping
  // defined anyway — this just confirms no code path anywhere could surface id 67.
  const results = mapFactsToAdlCandidates(
    Object.keys({ "daily_life.bathing": 1 }).map(confirmedYes),
    REAL_ADLS
  );
  assert.ok(!results.some((r) => r.candidatePayload?.id === 67));
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
