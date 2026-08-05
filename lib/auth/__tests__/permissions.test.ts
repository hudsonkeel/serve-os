import assert from "node:assert/strict";
import { canEditResidentProfile } from "../permissions.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("admin can edit resident profiles", () => {
  assert.equal(canEditResidentProfile("admin"), true);
});

test("manager can edit resident profiles", () => {
  assert.equal(canEditResidentProfile("manager"), true);
});

test("executive can edit resident profiles", () => {
  assert.equal(canEditResidentProfile("executive"), true);
});

test("operations cannot edit resident profiles", () => {
  assert.equal(canEditResidentProfile("operations"), false);
});

test("null role cannot edit resident profiles", () => {
  assert.equal(canEditResidentProfile(null), false);
});

test("undefined role cannot edit resident profiles", () => {
  assert.equal(canEditResidentProfile(undefined), false);
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
