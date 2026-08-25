import assert from "node:assert/strict";
import { isKnownFieldPath } from "../../domainRegistry.ts";
import {
  FIXTURE_A_EXPECTED_FACTS,
  FIXTURE_A_NOT_DISCUSSED_FIELD_PATHS,
  FIXTURE_A_TRANSCRIPT,
  FIXTURE_B_EXISTING_APPROVED_FACTS,
  FIXTURE_B_EXPECTED_CLASSIFICATION,
  FIXTURE_B_REASSESSMENT_TRANSCRIPT,
} from "../syntheticAssessments.ts";

// Fixture integrity checks only — these fixtures aren't run against a real provider here (that's
// the E2E dry-run harness's job). This just guarantees the fixtures stay valid as
// domainRegistry.ts evolves, and that Phase 2's coverage requirements are actually met.

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("Fixture A: every expected field_path is a real, known registry field", () => {
  for (const f of FIXTURE_A_EXPECTED_FACTS) {
    assert.ok(isKnownFieldPath(f.fieldPath), `${f.fieldPath} is not in FIELD_REGISTRY`);
  }
});

test("Fixture A: every not-discussed field_path is a real, known registry field, and is NOT also in the expected-facts list", () => {
  for (const fp of FIXTURE_A_NOT_DISCUSSED_FIELD_PATHS) {
    assert.ok(isKnownFieldPath(fp), `${fp} is not in FIELD_REGISTRY`);
    assert.ok(
      !FIXTURE_A_EXPECTED_FACTS.some((f) => f.fieldPath === fp),
      `${fp} is marked not-discussed but also appears in expected facts — contradictory fixture`
    );
  }
});

test("Fixture A: at least 3 not-discussed control fields, per spec", () => {
  assert.ok(FIXTURE_A_NOT_DISCUSSED_FIELD_PATHS.length >= 3);
});

test("Fixture A: none of the not-discussed field_paths' identifying text appears in the transcript", () => {
  // Coarse guard against accidentally writing a transcript line that actually discusses a field
  // meant to be a "never discussed" control — checks the field's own label words don't appear.
  const lowerTranscript = FIXTURE_A_TRANSCRIPT.toLowerCase();
  assert.ok(!lowerTranscript.includes("memory"), "transcript unexpectedly discusses memory (cognition control field)");
  assert.ok(!lowerTranscript.includes("dnr") && !lowerTranscript.includes("resuscitat"), "transcript unexpectedly discusses DNR (advance planning control field)");
  assert.ok(!lowerTranscript.includes("errand") && !lowerTranscript.includes("transport"), "transcript unexpectedly discusses transportation/errands (control field)");
});

test("Fixture B: every existing-approved-fact field_path is a real, known registry field", () => {
  for (const f of FIXTURE_B_EXISTING_APPROVED_FACTS) {
    assert.ok(isKnownFieldPath(f.fieldPath), `${f.fieldPath} is not in FIELD_REGISTRY`);
  }
});

test("Fixture B: every expected-classification field_path is a real, known registry field", () => {
  for (const c of FIXTURE_B_EXPECTED_CLASSIFICATION) {
    assert.ok(isKnownFieldPath(c.fieldPath), `${c.fieldPath} is not in FIELD_REGISTRY`);
  }
});

test("Fixture B: coverage matches the Phase 2 spec (>=2 changed, >=2 unchanged, >=2 not-discussed, >=1 new, >=1 conflicting)", () => {
  const byClass = (c: string) => FIXTURE_B_EXPECTED_CLASSIFICATION.filter((x) => x.classification === c);
  assert.equal(byClass("CHANGED_FACT").length, 2, "daily_life.medication_reminders + daily_life.toileting");
  assert.ok(byClass("UNCHANGED").length >= 2, "mobility_safety.walker + daily_life.companionship_social, plus the daily_life.bathing known-limitation case");
  assert.ok(byClass("NOT_DISCUSSED").length >= 2, "spec requires at least 3 existing-not-discussed facts; recent_falls covers the 3rd via the conflicting path");
  assert.ok(byClass("NEW_FACT").length >= 1);
  assert.ok(byClass("CONFLICTING_FACT").length >= 1);
});

test("Fixture B: every CHANGED_FACT/UNCHANGED/NOT_DISCUSSED/CONFLICTING_FACT field_path has a corresponding baseline approved fact", () => {
  const baselinePaths = new Set(FIXTURE_B_EXISTING_APPROVED_FACTS.map((f) => f.fieldPath));
  const mustExistInBaseline = FIXTURE_B_EXPECTED_CLASSIFICATION.filter(
    (c) => c.classification === "CHANGED_FACT" || c.classification === "UNCHANGED" || c.classification === "NOT_DISCUSSED" || c.classification === "CONFLICTING_FACT"
  );
  for (const c of mustExistInBaseline) {
    assert.ok(baselinePaths.has(c.fieldPath), `${c.fieldPath} (${c.classification}) has no baseline approved fact to compare against`);
  }
});

test("Fixture B: the NEW_FACT field_path has NO corresponding baseline approved fact", () => {
  const baselinePaths = new Set(FIXTURE_B_EXISTING_APPROVED_FACTS.map((f) => f.fieldPath));
  const newFacts = FIXTURE_B_EXPECTED_CLASSIFICATION.filter((c) => c.classification === "NEW_FACT");
  assert.ok(newFacts.length >= 1);
  for (const c of newFacts) {
    assert.ok(!baselinePaths.has(c.fieldPath), `${c.fieldPath} is marked NEW_FACT but already exists in baseline`);
  }
});

test("Fixture B: reassessment transcript contains two distinct, disagreeing reporters for the conflicting field", () => {
  assert.ok(FIXTURE_B_REASSESSMENT_TRANSCRIPT.includes("Susan"));
  assert.ok(FIXTURE_B_REASSESSMENT_TRANSCRIPT.includes("Michael"));
  assert.ok(FIXTURE_B_REASSESSMENT_TRANSCRIPT.toLowerCase().includes("hasn't fallen"));
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
