import assert from "node:assert/strict";
import { pickCommunityForCreation, reconcileCommunityForLinking } from "../communityIntegrity.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── pickCommunityForCreation ───────────────────────────────────────────

test("a linked resident's own community wins, even if the creator has a different current community selected", () => {
  const result = pickCommunityForCreation({
    hasResident: true,
    residentCommunityId: "c-frisco",
    currentSingleCommunityId: "c-firewheel",
  });
  assert.equal(result, "c-frisco");
});

test("with no linked resident, the creator's current single community applies automatically", () => {
  const result = pickCommunityForCreation({
    hasResident: false,
    residentCommunityId: null,
    currentSingleCommunityId: "c-firewheel",
  });
  assert.equal(result, "c-firewheel");
});

test("with no linked resident and no single community context (all_communities/unassigned), the relationship is genuinely unassigned, never guessed", () => {
  const result = pickCommunityForCreation({
    hasResident: false,
    residentCommunityId: null,
    currentSingleCommunityId: null,
  });
  assert.equal(result, null);
});

// ─── reconcileCommunityForLinking ───────────────────────────────────────

test("a relationship with no community yet inherits the resident's community on linking -- a fill-in, not a rewrite", () => {
  const result = reconcileCommunityForLinking({
    relationshipCommunityId: null,
    residentCommunityId: "c-mckinney",
  });
  assert.deepEqual(result, { ok: true, resolvedCommunityId: "c-mckinney" });
});

test("a relationship whose community already matches the resident's links cleanly, unchanged", () => {
  const result = reconcileCommunityForLinking({
    relationshipCommunityId: "c-frisco",
    residentCommunityId: "c-frisco",
  });
  assert.deepEqual(result, { ok: true, resolvedCommunityId: "c-frisco" });
});

test("a real mismatch is rejected outright, never silently rewritten on either side", () => {
  const result = reconcileCommunityForLinking({
    relationshipCommunityId: "c-frisco",
    residentCommunityId: "c-firewheel",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /does not match/i);
  }
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
