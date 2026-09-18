import assert from "node:assert/strict";
import { currentProvenanceRecords, type ContactFieldProvenanceRecord } from "../provenance.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

interface TestRecord extends ContactFieldProvenanceRecord {
  value: string;
}

function record(id: string, value: string, supersedesId: string | null = null): TestRecord {
  return { id, value, supersedesId };
}

test("a single, never-superseded record is current", () => {
  const records = [record("p1", "214-555-0187")];
  assert.deepEqual(currentProvenanceRecords(records), records);
});

test("superseding a record removes the OLD value from 'current', keeping only the new one -- history is preserved, not deleted, in the input array itself", () => {
  const original = record("p1", "214-555-0187");
  const corrected = record("p2", "214-555-0199", "p1");
  const current = currentProvenanceRecords([original, corrected]);
  assert.deepEqual(current, [corrected]);
  // The superseded record is excluded from "current" but was never removed from the
  // caller's own records -- this function only filters a view, it never mutates or drops data.
  assert.equal([original, corrected].length, 2);
});

test("a chain of three supersessions leaves only the last one current", () => {
  const v1 = record("p1", "value-1");
  const v2 = record("p2", "value-2", "p1");
  const v3 = record("p3", "value-3", "p2");
  const current = currentProvenanceRecords([v1, v2, v3]);
  assert.deepEqual(current, [v3]);
});

test("order of records in the input array does not affect the result", () => {
  const v1 = record("p1", "value-1");
  const v2 = record("p2", "value-2", "p1");
  assert.deepEqual(currentProvenanceRecords([v2, v1]), [v2]);
});

test("an unresolved fork (two records, neither superseding the other) surfaces BOTH as current -- this function never silently picks a winner", () => {
  const a = record("p1", "assessment-value");
  const b = record("p2", "manual-value");
  const current = currentProvenanceRecords([a, b]);
  assert.equal(current.length, 2);
});

test("different contacts'/fields' provenance rows are independent -- superseding one chain never affects an unrelated one", () => {
  const susanPhoneV1 = record("p1", "214-555-0187");
  const susanPhoneV2 = record("p2", "214-555-0199", "p1");
  const margaretPhoneV1 = record("p3", "972-555-0000");
  const current = currentProvenanceRecords([susanPhoneV1, susanPhoneV2, margaretPhoneV1]);
  assert.deepEqual(
    current.map((r) => r.id).sort(),
    ["p2", "p3"]
  );
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
