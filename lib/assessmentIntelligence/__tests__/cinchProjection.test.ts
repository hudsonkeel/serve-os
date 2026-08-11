import assert from "node:assert/strict";
import { buildCinchProjection, type ApprovedFactForProjection } from "../cinchProjection.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("maps approved facts into Cinch's General / Client Status / Environment structure, not an invented schema", () => {
  const facts: ApprovedFactForProjection[] = [
    { fieldPath: "what_why.primary_goals", assertionState: "confirmed_yes", value: "Stay independent at home", evidence: null },
    { fieldPath: "daily_life.bathing", assertionState: "confirmed_yes", value: true, evidence: "Needs help in the shower" },
    { fieldPath: "health.allergies", assertionState: "confirmed_yes", value: "Penicillin", evidence: null },
    { fieldPath: "mobility_safety.walker", assertionState: "confirmed_yes", value: true, evidence: null },
  ];
  const projection = buildCinchProjection(facts);
  assert.equal(projection.general.goalsOfService, "Stay independent at home");
  assert.equal(projection.clientStatus.adlsIadls["daily_life.bathing"], true);
  assert.equal(projection.clientStatus.allergies, "Penicillin");
  assert.equal(projection.environment.equipment["mobility_safety.walker"], true);
});

test("uncertain/conflicting facts are excluded from the projection", () => {
  const facts: ApprovedFactForProjection[] = [
    { fieldPath: "daily_life.bathing", assertionState: "uncertain", value: true, evidence: null },
  ];
  const projection = buildCinchProjection(facts);
  assert.ok(!("daily_life.bathing" in projection.clientStatus.adlsIadls));
});

test("insights for care team pull from relationship-intelligence facts with evidence", () => {
  const facts: ApprovedFactForProjection[] = [
    {
      fieldPath: "serve_relationship_intelligence.family_caregiver_stress",
      assertionState: "confirmed_yes",
      value: true,
      evidence: "Daughter sounded exhausted managing this alone.",
    },
  ];
  const projection = buildCinchProjection(facts);
  assert.deepEqual(projection.insightsForCareTeam, ["Daughter sounded exhausted managing this alone."]);
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
