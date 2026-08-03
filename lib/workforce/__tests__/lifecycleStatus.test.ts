// Pure-function tests for the derived Workforce lifecycle status — see
// lib/workforce/lifecycleStatus.ts.
//
//   node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/lifecycleStatus.test.ts
import assert from "node:assert/strict";
import { evaluateWorkforceLifecycleStatus } from "../lifecycleStatus.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const FIXED_NOW = () => new Date("2026-07-29T12:00:00");

// ─── Active caregiver ──────────────────────────────────────────────────────
test("active caregiver: statusActive=true, no termination date", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: true, terminationDate: null, startDate: "2020-01-01" },
    FIXED_NOW
  );
  assert.equal(result.status, "active");
  assert.equal(result.terminationDate, null);
  assert.match(result.explanation, /^Active because/);
});

// ─── Inactive caregiver without termination date ──────────────────────────
test("inactive caregiver: statusActive=false, no termination date, no future start date", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: false, terminationDate: null, startDate: "2020-01-01" },
    FIXED_NOW
  );
  assert.equal(result.status, "inactive");
  assert.match(result.explanation, /^Inactive because AxisCare reports the caregiver as inactive/);
});

test("inactive caregiver: no AxisCare source data at all", () => {
  const result = evaluateWorkforceLifecycleStatus(null, FIXED_NOW);
  assert.equal(result.status, "inactive");
  assert.match(result.explanation, /no AxisCare status is on file/);
});

// ─── Terminated caregiver (the Wendy Richardson case) ─────────────────────
test("terminated caregiver: termination date present", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: false, terminationDate: "2026-06-17", startDate: "2020-01-01" },
    FIXED_NOW
  );
  assert.equal(result.status, "terminated");
  assert.equal(result.terminationDate, "2026-06-17");
  assert.equal(result.explanation, "Terminated because AxisCare reports a termination date of June 17, 2026.");
});

// ─── Pending future start ──────────────────────────────────────────────────
test("pending future start: no termination date, statusActive false, startDate in the future", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: false, terminationDate: null, startDate: "2099-01-15" },
    FIXED_NOW
  );
  assert.equal(result.status, "pending_start");
  assert.equal(result.terminationDate, null);
  assert.match(result.explanation, /future start date of January 15, 2099/);
});

test("a start date in the past is not pending_start — falls through to inactive", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: false, terminationDate: null, startDate: "2020-01-01" },
    FIXED_NOW
  );
  assert.equal(result.status, "inactive");
});

test("statusActive=true takes priority over a future start date", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: true, terminationDate: null, startDate: "2099-01-15" },
    FIXED_NOW
  );
  assert.equal(result.status, "active");
});

// ─── Termination precedence over contradictory active=true ────────────────
test("termination date takes precedence even when AxisCare also reports statusActive=true", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: true, terminationDate: "2026-06-17", startDate: null },
    FIXED_NOW
  );
  assert.equal(result.status, "terminated");
  assert.equal(result.terminationDate, "2026-06-17");
});

test("termination date takes precedence over a future start date too", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: false, terminationDate: "2026-06-17", startDate: "2099-01-01" },
    FIXED_NOW
  );
  assert.equal(result.status, "terminated");
});

// ─── No termination-reason fabrication ─────────────────────────────────────
test("never invents a termination reason — explanation only cites the date AxisCare provides", () => {
  const result = evaluateWorkforceLifecycleStatus(
    { statusActive: false, terminationDate: "2026-06-17", startDate: null },
    FIXED_NOW
  );
  assert.equal(result.explanation.includes("because AxisCare reports a termination date"), true);
  // No fabricated cause words anywhere in the explanation. ("cause" itself
  // is deliberately excluded from this list — "because" would false-positive.)
  for (const forbidden of ["resign", "fired", "quit", "voluntary", "involuntary", "performance", "for cause"]) {
    assert.equal(result.explanation.toLowerCase().includes(forbidden), false, `explanation must not mention "${forbidden}"`);
  }
});

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
