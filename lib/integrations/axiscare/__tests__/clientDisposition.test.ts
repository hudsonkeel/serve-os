import assert from "node:assert/strict";
import { AXISCARE_CLIENT_DISPOSITIONS, isExcludedFromLifecycleCounts } from "../clientDisposition.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("AXISCARE_CLIENT_DISPOSITIONS has exactly the six intended values", () => {
  const actual = [...AXISCARE_CLIENT_DISPOSITIONS].sort();
  const expected = [
    "administrative_record",
    "needs_review",
    "non_client_related_person",
    "prospect",
    "real_client",
    "test_placeholder",
  ].sort();
  assert.deepEqual(actual, expected);
});

test("no disposition is excluded from lifecycle counts", () => {
  assert.equal(isExcludedFromLifecycleCounts(null), false);
});

test("real_client, prospect, and needs_review are never excluded from lifecycle counts", () => {
  assert.equal(isExcludedFromLifecycleCounts("real_client"), false);
  assert.equal(isExcludedFromLifecycleCounts("prospect"), false);
  assert.equal(isExcludedFromLifecycleCounts("needs_review"), false);
});

test("non_client_related_person, administrative_record, and test_placeholder are excluded from lifecycle counts", () => {
  assert.equal(isExcludedFromLifecycleCounts("non_client_related_person"), true);
  assert.equal(isExcludedFromLifecycleCounts("administrative_record"), true);
  assert.equal(isExcludedFromLifecycleCounts("test_placeholder"), true);
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
