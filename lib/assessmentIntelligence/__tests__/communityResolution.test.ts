import assert from "node:assert/strict";
import { resolveAssessmentCommunity } from "../communityResolution.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("resident inheritance: a linked resident's community wins over a different current context", () => {
  const result = resolveAssessmentCommunity({
    hasResident: true,
    residentCommunityId: "c-firewheel",
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: { mode: "single", communityId: "c-frisco" },
  });
  assert.deepEqual(result, { ok: true, communityId: "c-firewheel" });
});

test("relationship inheritance: a linked relationship's community applies when there's no resident source", () => {
  const result = resolveAssessmentCommunity({
    hasResident: false,
    residentCommunityId: null,
    hasRelationship: true,
    relationshipCommunityId: "c-mckinney",
    currentContext: { mode: "single", communityId: "c-frisco" },
  });
  assert.deepEqual(result, { ok: true, communityId: "c-mckinney" });
});

test("resident and relationship agreeing resolves cleanly to that shared value", () => {
  const result = resolveAssessmentCommunity({
    hasResident: true,
    residentCommunityId: "c-frisco",
    hasRelationship: true,
    relationshipCommunityId: "c-frisco",
    currentContext: { mode: "all" },
  });
  assert.deepEqual(result, { ok: true, communityId: "c-frisco" });
});

test("current-context fallback: no resident or relationship source, a single-community context applies", () => {
  const result = resolveAssessmentCommunity({
    hasResident: false,
    residentCommunityId: null,
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: { mode: "single", communityId: "c-firewheel" },
  });
  assert.deepEqual(result, { ok: true, communityId: "c-firewheel" });
});

test("conflicting sources are rejected, never silently resolved by picking one", () => {
  const result = resolveAssessmentCommunity({
    hasResident: true,
    residentCommunityId: "c-frisco",
    hasRelationship: true,
    relationshipCommunityId: "c-firewheel",
    currentContext: { mode: "all" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /disagree/i);
});

test("an all_communities context with no resident/relationship source is rejected, requiring explicit selection", () => {
  const result = resolveAssessmentCommunity({
    hasResident: false,
    residentCommunityId: null,
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: { mode: "all" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /select a specific community/i);
});

test("an unassigned context with no resident/relationship source resolves to null, structurally valid for a future direct-home assessment", () => {
  const result = resolveAssessmentCommunity({
    hasResident: false,
    residentCommunityId: null,
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: { mode: "none" },
  });
  assert.deepEqual(result, { ok: true, communityId: null });
});

test("a linked resident/relationship with no community of its own isn't treated as a vote for null -- current context still applies", () => {
  const result = resolveAssessmentCommunity({
    hasResident: true,
    residentCommunityId: null, // the resident exists but has no community yet
    hasRelationship: false,
    relationshipCommunityId: null,
    currentContext: { mode: "single", communityId: "c-heritage-ranch" },
  });
  assert.deepEqual(result, { ok: true, communityId: "c-heritage-ranch" });
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
