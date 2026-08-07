import assert from "node:assert/strict";
import { resolveDefaultCommunityScope, canSelectAllCommunities } from "../communityScope.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("an assigned community always wins, regardless of role", () => {
  const result = resolveDefaultCommunityScope({ communityId: "c-1", role: "manager" });
  assert.deepEqual(result, { mode: "single_community", communityId: "c-1" });
});

test("admin with no assignment defaults to all communities", () => {
  const result = resolveDefaultCommunityScope({ communityId: null, role: "admin" });
  assert.deepEqual(result, { mode: "all_communities" });
});

test("non-admin roles with no assignment are 'unassigned' — a real gap, never silently 'all communities'", () => {
  assert.deepEqual(resolveDefaultCommunityScope({ communityId: null, role: "manager" }), { mode: "unassigned" });
  assert.deepEqual(resolveDefaultCommunityScope({ communityId: null, role: "executive" }), { mode: "unassigned" });
  assert.deepEqual(resolveDefaultCommunityScope({ communityId: null, role: "operations" }), { mode: "unassigned" });
});

test("canSelectAllCommunities is true only for admin today", () => {
  assert.equal(canSelectAllCommunities("admin"), true);
  assert.equal(canSelectAllCommunities("manager"), false);
  assert.equal(canSelectAllCommunities("executive"), false);
  assert.equal(canSelectAllCommunities("operations"), false);
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
