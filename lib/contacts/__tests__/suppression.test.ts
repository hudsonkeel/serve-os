import assert from "node:assert/strict";
import { isContactPairSuppressed } from "../suppression.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("a suppressed pair is detected regardless of which order the two ids are queried in", () => {
  const suppressed = [{ contactIdA: "contact-1", contactIdB: "contact-2" }];
  assert.equal(isContactPairSuppressed(suppressed, "contact-1", "contact-2"), true);
  assert.equal(isContactPairSuppressed(suppressed, "contact-2", "contact-1"), true);
});

test("an unrelated pair is never reported as suppressed", () => {
  const suppressed = [{ contactIdA: "contact-1", contactIdB: "contact-2" }];
  assert.equal(isContactPairSuppressed(suppressed, "contact-1", "contact-3"), false);
  assert.equal(isContactPairSuppressed(suppressed, "contact-3", "contact-4"), false);
});

test("an empty suppression list never reports anything suppressed", () => {
  assert.equal(isContactPairSuppressed([], "contact-1", "contact-2"), false);
});

test("suppression is specific to the exact pair -- a contact suppressed against one other contact is not suppressed against a third", () => {
  const suppressed = [{ contactIdA: "contact-1", contactIdB: "contact-2" }];
  assert.equal(isContactPairSuppressed(suppressed, "contact-1", "contact-9"), false);
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
