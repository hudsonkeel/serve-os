import assert from "node:assert/strict";
import { isAxisCareCommunityPlaceholderRecord } from "../placeholderRecords.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("client #3's real lastName ('Community') is correctly identified as a placeholder", () => {
  assert.equal(isAxisCareCommunityPlaceholderRecord({ lastName: "Community" }), true);
});

test("case-insensitive match", () => {
  assert.equal(isAxisCareCommunityPlaceholderRecord({ lastName: "COMMUNITY" }), true);
  assert.equal(isAxisCareCommunityPlaceholderRecord({ lastName: "community" }), true);
});

test("a real client's lastName is never flagged", () => {
  assert.equal(isAxisCareCommunityPlaceholderRecord({ lastName: "Matos" }), false);
  assert.equal(isAxisCareCommunityPlaceholderRecord({ lastName: "Goldberg" }), false);
});

test("a null lastName is never flagged", () => {
  assert.equal(isAxisCareCommunityPlaceholderRecord({ lastName: null }), false);
});

test("a lastName that merely contains the word 'Community' as part of something longer is not an exact match, so it is not flagged", () => {
  assert.equal(isAxisCareCommunityPlaceholderRecord({ lastName: "Community Center" }), false);
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
