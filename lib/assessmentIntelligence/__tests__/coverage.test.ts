import assert from "node:assert/strict";
import {
  computeAssessmentCoverage,
  buildCanonicalCoverageFacts,
  CORE_TOPICS,
  CONDITIONAL_TOPICS,
  type CoverageFact,
  type CanonicalResidentProfileFacts,
} from "../coverage.ts";
import type { AssertionState } from "../factTypes.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function f(fieldPath: string, assertionState: AssertionState = "confirmed_yes"): CoverageFact {
  return { fieldPath, assertionState };
}

// Trigger-sensitive Core field_paths, set to confirmed_no by default so establishing every Core
// topic doesn't accidentally fire any Conditional trigger — a clean "everything covered, no
// conditional in view" baseline. residence.community (not itself a coverage topic) is added
// confirmed_yes to keep the "not a recognized partner community" trigger unfired too.
const TRIGGER_SAFE_OVERRIDES: Record<string, AssertionState> = {
  "cognition.short_term_memory_change": "confirmed_no",
  "cognition.disorientation": "confirmed_no",
  "daily_life.medication_reminders": "confirmed_no",
  "daily_life.transfers": "confirmed_no",
  "mobility_safety.recent_falls": "confirmed_no",
  "mobility_safety.walker": "confirmed_no",
};

function fullyCoveredBaseline(): CoverageFact[] {
  const facts: CoverageFact[] = [];
  for (const topic of CORE_TOPICS) {
    for (const fieldPath of topic.fieldPaths) {
      facts.push(f(fieldPath, TRIGGER_SAFE_OVERRIDES[fieldPath] ?? "confirmed_yes"));
    }
  }
  facts.push(f("residence.community", "confirmed_yes"));
  return facts;
}

test("no facts at all: every Core topic missing; Conditional topics stay invisible except full_address, whose trigger legitimately fires on silence (we don't yet know the resident is in a partner community)", () => {
  const coverage = computeAssessmentCoverage([]);
  const missingIds = coverage.missingTopics.map((t) => t.id);
  assert.ok(missingIds.includes("dob"));
  assert.ok(missingIds.includes("primary_contact"));
  assert.ok(missingIds.includes("full_address"));
  assert.equal(missingIds.length, CORE_TOPICS.length + 1);
  for (const conditional of CONDITIONAL_TOPICS) {
    if (conditional.id === "full_address") continue;
    assert.ok(!missingIds.includes(conditional.id), `${conditional.id} should be invisible, not missing, when its trigger never fires`);
  }
});

test("a confirmed_no fact still counts as established — silence means unknown, a real 'No' is not silence", () => {
  const coverage = computeAssessmentCoverage([f("health.recent_hospitalization", "confirmed_no")]);
  assert.ok(!coverage.missingTopics.some((t) => t.id === "recent_hospitalization"));
});

test("the fully-covered baseline has nothing missing", () => {
  const coverage = computeAssessmentCoverage(fullyCoveredBaseline());
  assert.deepEqual(coverage.missingTopics, []);
  assert.equal(coverage.summary, null);
});

test("mobility devices (any-of): established by ANY one device, not all four", () => {
  const facts = fullyCoveredBaseline().filter(
    (fact) => !["mobility_safety.walker", "mobility_safety.cane", "mobility_safety.wheelchair", "mobility_safety.shower_equipment"].includes(fact.fieldPath)
  );
  facts.push(f("mobility_safety.cane", "confirmed_no"));
  const coverage = computeAssessmentCoverage(facts);
  assert.ok(!coverage.missingTopics.some((t) => t.id === "mobility_devices"));
});

test("mobility devices missing only when NONE of the four are established", () => {
  const facts = fullyCoveredBaseline().filter(
    (fact) => !["mobility_safety.walker", "mobility_safety.cane", "mobility_safety.wheelchair", "mobility_safety.shower_equipment"].includes(fact.fieldPath)
  );
  const coverage = computeAssessmentCoverage(facts);
  assert.ok(coverage.missingTopics.some((t) => t.id === "mobility_devices"));
});

test("physician contact (all-of): name alone does NOT establish the topic — the other component must not be hidden", () => {
  const coverage = computeAssessmentCoverage([f("important_people.physician_name", "confirmed_yes")]);
  assert.ok(coverage.missingTopics.some((t) => t.id === "physician_contact"));
});

test("physician contact (all-of): established only once BOTH name and phone are present", () => {
  const coverage = computeAssessmentCoverage([
    f("important_people.physician_name", "confirmed_yes"),
    f("important_people.physician_phone", "confirmed_yes"),
  ]);
  assert.ok(!coverage.missingTopics.some((t) => t.id === "physician_contact"));
});

test("vision and hearing are separate Core topics — establishing one never hides the other", () => {
  const coverage = computeAssessmentCoverage([f("vision_hearing.visual_impairment", "confirmed_yes")]);
  const ids = coverage.missingTopics.map((t) => t.id);
  assert.ok(!ids.includes("vision_impairment"));
  assert.ok(ids.includes("hearing_impairment"));
});

test("desired start timing, frequency, and duration are separate Core topics", () => {
  const coverage = computeAssessmentCoverage([f("when.desired_start_timing", "confirmed_yes")]);
  const ids = coverage.missingTopics.map((t) => t.id);
  assert.ok(!ids.includes("desired_start_timing"));
  assert.ok(ids.includes("care_frequency"));
  assert.ok(ids.includes("visit_duration"));
});

test("swallowing risk and precautions/restrictions are Core, unconditional — missing with no other findings at all", () => {
  const coverage = computeAssessmentCoverage([]);
  const ids = coverage.missingTopics.map((t) => t.id);
  assert.ok(ids.includes("swallowing_risk"));
  assert.ok(ids.includes("precautions_restrictions"));
});

test("an unfired Conditional trigger keeps its topics invisible, not counted as missing", () => {
  const coverage = computeAssessmentCoverage([f("daily_life.medication_reminders", "confirmed_no")]);
  const ids = coverage.missingTopics.map((t) => t.id);
  assert.ok(!ids.includes("medication_timing"));
  assert.ok(!ids.includes("medication_setup"));
});

test("a fired Conditional trigger surfaces its unestablished topics", () => {
  const coverage = computeAssessmentCoverage([f("daily_life.medication_reminders", "confirmed_yes")]);
  const ids = coverage.missingTopics.map((t) => t.id);
  assert.ok(ids.includes("medication_timing"));
  assert.ok(ids.includes("medication_setup"));
});

test("decision-maker details (all-of, Conditional): POA mentioned but only the name known — still missing", () => {
  const coverage = computeAssessmentCoverage([
    f("advance_planning.medical_poa", "confirmed_yes"),
    f("important_people.decision_maker", "confirmed_yes"),
  ]);
  assert.ok(coverage.missingTopics.some((t) => t.id === "decision_maker_details"));
});

test("decision-maker details established only once name, relationship, AND phone are all present", () => {
  const coverage = computeAssessmentCoverage([
    f("advance_planning.medical_poa", "confirmed_yes"),
    f("important_people.decision_maker", "confirmed_yes"),
    f("important_people.decision_maker_relationship", "confirmed_yes"),
    f("important_people.decision_maker_phone", "confirmed_yes"),
  ]);
  assert.ok(!coverage.missingTopics.some((t) => t.id === "decision_maker_details"));
});

test("full address (all-of, Conditional): apartment/unit alone must not make the topic look covered", () => {
  const coverage = computeAssessmentCoverage([f("residence.apartment_unit", "confirmed_yes")]);
  assert.ok(coverage.missingTopics.some((t) => t.id === "full_address"), "apartment/unit is not one of the required components");
});

test("full address established once street, city, state, and postal code are all present (apartment/unit not required)", () => {
  const coverage = computeAssessmentCoverage([
    f("residence.address_line1", "confirmed_yes"),
    f("residence.city", "confirmed_yes"),
    f("residence.state", "confirmed_yes"),
    f("residence.postal_code", "confirmed_yes"),
  ]);
  assert.ok(!coverage.missingTopics.some((t) => t.id === "full_address"));
});

test("full address trigger doesn't fire when the resident is confirmed in a recognized community", () => {
  const coverage = computeAssessmentCoverage([f("residence.community", "confirmed_yes")]);
  assert.ok(!coverage.missingTopics.some((t) => t.id === "full_address"));
});

test("Supplemental fields never appear as missing, however many facts exist or don't", () => {
  const coverage = computeAssessmentCoverage([]);
  const ids = coverage.missingTopics.map((t) => t.id);
  assert.ok(!ids.includes("identity_email"));
  assert.ok(!ids.includes("preferred_name"));
  // Supplemental field_paths aren't referenced by any topic at all — confirm the registry
  // field itself never shows up as a topic id either.
  assert.ok(!coverage.missingTopics.some((t) => (t.id as string) === "identity.email"));
});

test("0 missing topics: no summary sentence", () => {
  const coverage = computeAssessmentCoverage(fullyCoveredBaseline());
  assert.equal(coverage.summary, null);
});

test("1 missing topic: singular phrasing", () => {
  const facts = fullyCoveredBaseline().filter((fact) => fact.fieldPath !== "health.allergies");
  const coverage = computeAssessmentCoverage(facts);
  assert.equal(coverage.missingTopics.length, 1);
  assert.equal(coverage.summary, "Based on the assessment conversation, 1 important topic still needs clarification: allergies.");
});

test("2-5 missing topics: plural phrasing with an Oxford-comma 'and' list, no 'including'/'more'", () => {
  const facts = fullyCoveredBaseline().filter(
    (fact) => !["health.allergies", "health.swallowing_risk", "health.precautions_restrictions"].includes(fact.fieldPath)
  );
  const coverage = computeAssessmentCoverage(facts);
  assert.equal(coverage.missingTopics.length, 3);
  assert.match(coverage.summary ?? "", /^Based on the assessment conversation, 3 important topics still need clarification: .+, and .+\.$/);
  assert.doesNotMatch(coverage.summary ?? "", /including|more\.$/);
});

test(">5 missing topics: 'including' phrasing with the total count, capped list, never an unreadable wall of topics", () => {
  const coverage = computeAssessmentCoverage([]); // nothing established -> every Core topic missing
  assert.ok(coverage.missingTopics.length > 5);
  assert.match(
    coverage.summary ?? "",
    new RegExp(`^Based on the assessment conversation, ${coverage.missingTopics.length} important topics still need clarification, including .+, and more\\.$`)
  );
});

// ─── Canonical resident/profile knowledge (2026-09-17) ─────────────────
// The Maggie finding: a known Watermere at McKinney resident whose DOB and phone were entered
// at resident creation was incorrectly flagged as still needing them, and her recognized
// partner-community address was incorrectly treated as an incomplete street address just
// because the transcript never re-stated the community by name.

const NO_CANONICAL_PROFILE: CanonicalResidentProfileFacts = {
  dateOfBirth: null,
  phone: null,
  communityId: null,
  addressLine1: null,
  city: null,
  state: null,
  postalCode: null,
  physicianName: null,
  physicianPhone: null,
  primaryContactName: null,
};

const MAGGIE_CANONICAL_PROFILE: CanonicalResidentProfileFacts = {
  ...NO_CANONICAL_PROFILE,
  dateOfBirth: "1938-04-12",
  phone: "9725551234",
  communityId: "watermere-mckinney-community-id",
};

test("canonical DOB satisfies DOB coverage even though this conversation never discussed it", () => {
  const coverage = computeAssessmentCoverage([], buildCanonicalCoverageFacts(MAGGIE_CANONICAL_PROFILE));
  assert.ok(!coverage.missingTopics.some((t) => t.id === "dob"));
});

test("canonical phone satisfies phone coverage even though this conversation never discussed it", () => {
  const coverage = computeAssessmentCoverage([], buildCanonicalCoverageFacts(MAGGIE_CANONICAL_PROFILE));
  assert.ok(!coverage.missingTopics.some((t) => t.id === "basic_contact"));
});

test("MAGGIE CASE: a recognized Watermere/community resident does not get asked for a full institutional street address merely because the transcript omitted the community name", () => {
  const coverage = computeAssessmentCoverage([], buildCanonicalCoverageFacts(MAGGIE_CANONICAL_PROFILE));
  assert.ok(
    !coverage.missingTopics.some((t) => t.id === "full_address"),
    "full_address must not even be evaluated once community_id is canonically known -- the trigger must not fire"
  );
});

test("without canonical community_id, an unrecognized-community resident's full address is still correctly asked for (the fix narrows the trigger, it doesn't disable it)", () => {
  const coverage = computeAssessmentCoverage([], buildCanonicalCoverageFacts(NO_CANONICAL_PROFILE));
  assert.ok(coverage.missingTopics.some((t) => t.id === "full_address"));
});

test("assessment-derived confirmed_no still counts as established alongside canonical knowledge -- the two sources combine, neither shadows the other", () => {
  const coverage = computeAssessmentCoverage(
    [f("health.recent_hospitalization", "confirmed_no")],
    buildCanonicalCoverageFacts(MAGGIE_CANONICAL_PROFILE)
  );
  assert.ok(!coverage.missingTopics.some((t) => t.id === "recent_hospitalization"));
  assert.ok(!coverage.missingTopics.some((t) => t.id === "dob"), "canonical DOB must still also be established in the same call");
});

test("canonical knowledge never fabricates a No -- CanonicalCoverageFact is structurally presence-only, it cannot carry an assertion state or value at all", () => {
  const facts = buildCanonicalCoverageFacts(MAGGIE_CANONICAL_PROFILE);
  assert.ok(facts.length > 0, "sanity check: the fixture actually produced some canonical facts");
  for (const fact of facts) {
    assert.deepEqual(Object.keys(fact), ["fieldPath"], `${fact.fieldPath} must carry nothing but its field path`);
  }
});

test("a blank/null canonical field contributes nothing -- never a fabricated presence", () => {
  const facts = buildCanonicalCoverageFacts(NO_CANONICAL_PROFILE);
  assert.deepEqual(facts, []);
});

test("physician contact (all-of): canonical name AND phone together establish the topic, matching the same all-of rule as assessment facts", () => {
  const coverage = computeAssessmentCoverage(
    [],
    buildCanonicalCoverageFacts({ ...NO_CANONICAL_PROFILE, physicianName: "Dr. Lee", physicianPhone: "9725559876" })
  );
  assert.ok(!coverage.missingTopics.some((t) => t.id === "physician_contact"));
});

test("physician contact (all-of): canonical name alone is still not enough -- the all-of rule applies identically to canonical sources", () => {
  const coverage = computeAssessmentCoverage([], buildCanonicalCoverageFacts({ ...NO_CANONICAL_PROFILE, physicianName: "Dr. Lee" }));
  assert.ok(coverage.missingTopics.some((t) => t.id === "physician_contact"));
});

test("existing family/primary contact data satisfies the primary_contact topic when semantically equivalent", () => {
  const coverage = computeAssessmentCoverage([], buildCanonicalCoverageFacts({ ...NO_CANONICAL_PROFILE, primaryContactName: "Susan Carter" }));
  assert.ok(!coverage.missingTopics.some((t) => t.id === "primary_contact"));
});

test("full address (all-of): canonical address components combine exactly like assessment facts -- partial canonical address alone is still incomplete", () => {
  const coverage = computeAssessmentCoverage(
    [],
    buildCanonicalCoverageFacts({ ...NO_CANONICAL_PROFILE, addressLine1: "123 Main St", city: "Frisco" })
  );
  assert.ok(coverage.missingTopics.some((t) => t.id === "full_address"), "state and postal_code are still missing");
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
