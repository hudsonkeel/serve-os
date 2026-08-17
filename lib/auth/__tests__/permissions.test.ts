import assert from "node:assert/strict";
import { canAccessResidentEvidence, canEditResidentProfile } from "../permissions.ts";

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

test("admin can access resident evidence", () => {
  assert.equal(canAccessResidentEvidence("admin"), true);
});

test("manager can access resident evidence", () => {
  assert.equal(canAccessResidentEvidence("manager"), true);
});

test("executive can access resident evidence", () => {
  assert.equal(canAccessResidentEvidence("executive"), true);
});

test("operations cannot access resident evidence", () => {
  assert.equal(canAccessResidentEvidence("operations"), false);
});

test("null role cannot access resident evidence", () => {
  assert.equal(canAccessResidentEvidence(null), false);
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
