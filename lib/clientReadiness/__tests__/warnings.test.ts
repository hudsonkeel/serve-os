import assert from "node:assert/strict";
import { combineWarnings } from "../warnings.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("no warnings: returns undefined, never an empty string", () => {
  assert.equal(combineWarnings([]), undefined);
});

test("a single warning: returned as-is", () => {
  assert.equal(combineWarnings(["Billing could not be linked."]), "Billing could not be linked.");
});

test("two independent warnings (e.g. enrollment failure AND billing-link failure): both preserved, neither overwrites the other", () => {
  const result = combineWarnings([
    "Service Agreement recorded, but client enrollment could not be completed: RPC error.",
    "Service Agreement recorded, but Billing could not be linked: requirement not found.",
  ]);
  assert.match(result ?? "", /client enrollment could not be completed/);
  assert.match(result ?? "", /Billing could not be linked/);
});

test("warning order is preserved: earlier issues appear before later ones", () => {
  const result = combineWarnings(["first issue", "second issue"]);
  assert.ok((result ?? "").indexOf("first issue") < (result ?? "").indexOf("second issue"));
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
