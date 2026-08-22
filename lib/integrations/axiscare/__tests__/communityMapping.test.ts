import assert from "node:assert/strict";
import { resolveAxisCareCommunityCode } from "../communityMapping.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("community.id = 1 resolves to watermere_frisco", () => {
  const result = resolveAxisCareCommunityCode({ communityId: 1, communityName: null, classCodes: [] });
  assert.deepEqual(result, { communityCode: "watermere_frisco", source: "community_id" });
});

test("community.id = 2 resolves to watermere_firewheel", () => {
  const result = resolveAxisCareCommunityCode({ communityId: 2, communityName: null, classCodes: [] });
  assert.deepEqual(result, { communityCode: "watermere_firewheel", source: "community_id" });
});

test("community.id wins over community.name and classes when all three are present", () => {
  const result = resolveAxisCareCommunityCode({ communityId: 1, communityName: "Watermere at Firewheel", classCodes: ["Watermere Firewheel"] });
  assert.deepEqual(result, { communityCode: "watermere_frisco", source: "community_id" });
});

test("exact community.name fallback: 'Watermere at Frisco'", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: "Watermere at Frisco", classCodes: [] });
  assert.deepEqual(result, { communityCode: "watermere_frisco", source: "community_name" });
});

test("exact community.name fallback: 'Watermere at Firewheel'", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: "Watermere at Firewheel", classCodes: [] });
  assert.deepEqual(result, { communityCode: "watermere_firewheel", source: "community_name" });
});

test("exact 'Watermere Frisco' class fallback when community.id and .name are both null (the Linda Kaplan case)", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: null, classCodes: ["Watermere Frisco", "PC"] });
  assert.deepEqual(result, { communityCode: "watermere_frisco", source: "class_code" });
});

test("exact 'Watermere Firewheel' class fallback", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: null, classCodes: ["Watermere Firewheel"] });
  assert.deepEqual(result, { communityCode: "watermere_firewheel", source: "class_code" });
});

test("mixed class 'WAFrisco Signed Agreement / No Visits' resolves community via class_code fallback", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: null, classCodes: ["WAFrisco Signed Agreement / No Visits"] });
  assert.deepEqual(result, { communityCode: "watermere_frisco", source: "class_code" });
});

test("mixed class 'WAFirewheel Prospect' resolves community via class_code fallback", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: null, classCodes: ["WAFirewheel Prospect"] });
  assert.deepEqual(result, { communityCode: "watermere_firewheel", source: "class_code" });
});

test("Maria reproduction: community.id=2, community.name='Watermere at Firewheel', classes include both Firewheel labels -> watermere_firewheel via community_id (strongest source)", () => {
  const result = resolveAxisCareCommunityCode({
    communityId: 2,
    communityName: "Watermere at Firewheel",
    classCodes: ["Watermere Firewheel", "CINCH", "PC", "WAFirewheel Prospect"],
  });
  assert.deepEqual(result, { communityCode: "watermere_firewheel", source: "community_id" });
});

test("an unknown/unreviewed community.id never guesses -- falls through to name/class, or unresolved", () => {
  const result = resolveAxisCareCommunityCode({ communityId: 99, communityName: null, classCodes: [] });
  assert.deepEqual(result, { communityCode: null, source: "unresolved" });
});

test("an unknown class string never resolves via substring matching -- 'Some New Community Prospect' stays unresolved", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: null, classCodes: ["Some New Community Prospect"] });
  assert.deepEqual(result, { communityCode: null, source: "unresolved" });
});

test("McKinney has no reviewed AxisCare mapping yet -- any McKinney-labeled value stays unresolved until one is added", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: "Watermere at McKinney", classCodes: ["Watermere McKinney"] });
  assert.deepEqual(result, { communityCode: null, source: "unresolved" });
});

test("nothing resolves -> unresolved, never defaulted to Frisco", () => {
  const result = resolveAxisCareCommunityCode({ communityId: null, communityName: null, classCodes: ["CINCH", "PC"] });
  assert.deepEqual(result, { communityCode: null, source: "unresolved" });
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
