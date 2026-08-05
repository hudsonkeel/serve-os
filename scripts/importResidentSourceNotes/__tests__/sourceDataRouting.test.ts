// Tests over the transcribed source data itself — synthetic-record
// rejection (rule 17) and historical/planning whiteboard note routing
// (data-placement principle D: dated/historical whiteboard content routes
// to a dated note, never straight into Current Needs). Run with:
//   npm run test:importResidentSourceNotes
import assert from "node:assert/strict";
import { SOURCE_1_RECORDS, SOURCE_2_RECORDS } from "../sourceData.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── Synthetic-record rejection (rule 17) ───────────────────────────────

test("1. D. Kakazu (record 13) is flagged synthetic-data-policy with no write destinations", () => {
  const record = SOURCE_2_RECORDS.find((r) => r.recordIndex === 13);
  assert.ok(record, "record 13 should exist");
  assert.equal(record!.synthenticDataPolicyFlag, true);
  assert.deepEqual(record!.destinations, []);
});

test("2. no other Source 2 record is marked synthetic-data-policy", () => {
  const flagged = SOURCE_2_RECORDS.filter((r) => r.recordIndex !== 13 && r.synthenticDataPolicyFlag);
  assert.deepEqual(flagged, []);
});

// ─── Historical/planning content never lands in Current Needs ──────────

test("3. every record with a historicalNote or statusNote routes to timeline_or_dated_note, not current_needs_reinforce alone", () => {
  const violations: number[] = [];
  for (const record of SOURCE_2_RECORDS) {
    if (record.historicalNote || record.statusNote) {
      if (!record.destinations.includes("timeline_or_dated_note")) {
        violations.push(record.recordIndex);
      }
    }
  }
  assert.deepEqual(violations, [], `Records missing timeline_or_dated_note routing: ${violations.join(", ")}`);
});

test("4. records that only propose a service (no confirmation) never claim current_needs_reinforce without an explicit need", () => {
  for (const record of SOURCE_2_RECORDS) {
    if (record.destinations.includes("current_needs_reinforce")) {
      assert.ok(record.need, `record ${record.recordIndex} claims current_needs_reinforce but has no need field`);
    }
  }
});

test("5. records destined for service_opportunity never appear alongside a synthetic-data-policy flag", () => {
  for (const record of SOURCE_2_RECORDS) {
    if (record.synthenticDataPolicyFlag) {
      assert.ok(!record.destinations.includes("service_opportunity"));
    }
  }
});

// ─── Source 1 shared/couple entry handling ──────────────────────────────

test("6. the Source 1 couple record (apartment 7313) is not silently treated as a single-resident entry", () => {
  const record = SOURCE_1_RECORDS.find((r) => r.apartment === "7313");
  assert.ok(record);
  assert.equal(record!.residentNames.length, 2);
});

test("7. every Source 1 record has at least one need transcribed", () => {
  for (const record of SOURCE_1_RECORDS) {
    assert.ok(record.needs.length > 0, `record ${record.recordIndex} has no needs`);
  }
});

// ─── Runner ──────────────────────────────────────────────────────────

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();
