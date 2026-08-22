import assert from "node:assert/strict";
import { groupCommunitiesByCareModel, CARE_MODEL_LABELS } from "../careModel.ts";
import type { Community } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function community(overrides: Partial<Community>): Community {
  return {
    id: "c-" + Math.random(),
    code: "some_code",
    name: "Some Community",
    care_model: "community_care",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("the three Watermere communities group under community_care", () => {
  const communities = [
    community({ code: "watermere_frisco", name: "Watermere at Frisco", care_model: "community_care" }),
    community({ code: "watermere_firewheel", name: "Watermere at Firewheel", care_model: "community_care" }),
    community({ code: "watermere_mckinney", name: "Watermere at McKinney", care_model: "community_care" }),
  ];
  const grouped = groupCommunitiesByCareModel(communities);
  assert.equal(grouped.community_care.length, 3);
  assert.equal(grouped.traditional_care.length, 0);
});

test("Frisco Lakes and Heritage Ranch group under traditional_care", () => {
  const communities = [
    community({ code: "frisco_lakes", name: "Frisco Lakes", care_model: "traditional_care" }),
    community({ code: "heritage_ranch", name: "Heritage Ranch", care_model: "traditional_care" }),
  ];
  const grouped = groupCommunitiesByCareModel(communities);
  assert.equal(grouped.traditional_care.length, 2);
  assert.equal(grouped.community_care.length, 0);
});

test("care model is read from the stored field, never inferred from the display name", () => {
  // Deliberately adversarial fixture: a name containing "Watermere" but
  // explicitly stored as traditional_care, and a name with no Watermere
  // reference stored as community_care. A name-pattern-matching
  // implementation would misclassify both; the real implementation must
  // not.
  const communities = [
    community({ code: "trap_1", name: "Watermere-Adjacent Test Fixture", care_model: "traditional_care" }),
    community({ code: "trap_2", name: "Totally Unrelated Name", care_model: "community_care" }),
  ];
  const grouped = groupCommunitiesByCareModel(communities);
  assert.equal(grouped.traditional_care[0]?.code, "trap_1");
  assert.equal(grouped.community_care[0]?.code, "trap_2");
});

test("an empty community list produces empty groups, not an error", () => {
  const grouped = groupCommunitiesByCareModel([]);
  assert.deepEqual(grouped, { community_care: [], traditional_care: [] });
});

test("CARE_MODEL_LABELS covers both care models with a human-readable label", () => {
  assert.equal(CARE_MODEL_LABELS.community_care, "Community Care");
  assert.equal(CARE_MODEL_LABELS.traditional_care, "Traditional Care");
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
