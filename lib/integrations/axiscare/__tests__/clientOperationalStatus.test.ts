import assert from "node:assert/strict";
import { resolveAxisCareClientOperationalBucket } from "../clientOperationalStatus.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("no disposition: computed lifecycle passes through unchanged, for every lifecycle value", () => {
  assert.equal(resolveAxisCareClientOperationalBucket("active_client", null), "active_client");
  assert.equal(resolveAxisCareClientOperationalBucket("inactive_client", null), "inactive_client");
  assert.equal(resolveAxisCareClientOperationalBucket("prospect", null), "prospect");
  assert.equal(resolveAxisCareClientOperationalBucket("needs_review", null), "needs_review");
});

test("real_client, prospect, needs_review dispositions never override the computed lifecycle", () => {
  assert.equal(resolveAxisCareClientOperationalBucket("active_client", "real_client"), "active_client");
  assert.equal(resolveAxisCareClientOperationalBucket("inactive_client", "prospect"), "inactive_client");
  assert.equal(resolveAxisCareClientOperationalBucket("needs_review", "needs_review"), "needs_review");
});

test("non_client_related_person disposition always excludes, regardless of computed lifecycle", () => {
  assert.equal(resolveAxisCareClientOperationalBucket("active_client", "non_client_related_person"), "excluded");
  assert.equal(resolveAxisCareClientOperationalBucket("inactive_client", "non_client_related_person"), "excluded");
});

test("administrative_record and test_placeholder dispositions always exclude", () => {
  assert.equal(resolveAxisCareClientOperationalBucket("active_client", "administrative_record"), "excluded");
  assert.equal(resolveAxisCareClientOperationalBucket("prospect", "test_placeholder"), "excluded");
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
