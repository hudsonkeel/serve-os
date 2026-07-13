// Pure-function tests for lib/scheduling/status.ts. Run with:
//   npm run test:scheduling
import assert from "node:assert/strict";
import { determineVisitStatus } from "../status.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. assigned scheduled visit (caregiver present, not started)", () => {
  const status = determineVisitStatus({
    removed: false,
    hasCaregiver: true,
    clockInTime: null,
    clockOutTime: null,
  });
  assert.equal(status, "scheduled");
});

test("2. unassigned visit (no caregiver, not started)", () => {
  const status = determineVisitStatus({
    removed: false,
    hasCaregiver: false,
    clockInTime: null,
    clockOutTime: null,
  });
  assert.equal(status, "unassigned");
});

test("3. in-progress visit (clocked in, not clocked out)", () => {
  const status = determineVisitStatus({
    removed: false,
    hasCaregiver: true,
    clockInTime: "2026-01-15T15:00:00.000Z",
    clockOutTime: null,
  });
  assert.equal(status, "in_progress");
});

test("4. completed visit (clocked out)", () => {
  const status = determineVisitStatus({
    removed: false,
    hasCaregiver: true,
    clockInTime: "2026-01-15T15:00:00.000Z",
    clockOutTime: "2026-01-15T16:00:00.000Z",
  });
  assert.equal(status, "completed");
});

test("4b. completed visit takes precedence even without a recorded clock-in", () => {
  // clockOut existing is treated as the strongest completion signal
  // regardless of whether clockIn is also present.
  const status = determineVisitStatus({
    removed: false,
    hasCaregiver: true,
    clockInTime: null,
    clockOutTime: "2026-01-15T16:00:00.000Z",
  });
  assert.equal(status, "completed");
});

test("5. removed visit takes precedence over every other signal", () => {
  const status = determineVisitStatus({
    removed: true,
    hasCaregiver: true,
    clockInTime: "2026-01-15T15:00:00.000Z",
    clockOutTime: "2026-01-15T16:00:00.000Z",
  });
  assert.equal(status, "removed");
});

test("6. no trustworthy 'missed' indicator exists — this rule set does not produce 'missed'", () => {
  // Explicitly does not infer "missed" from wall-clock time. A visit with
  // no clock-in and no caregiver, well past a hypothetical scheduled end,
  // still resolves deterministically via the unassigned rule, not a
  // manufactured "missed" guess.
  const status = determineVisitStatus({
    removed: false,
    hasCaregiver: false,
    clockInTime: null,
    clockOutTime: null,
  });
  assert.notEqual(status, "missed");
  assert.equal(status, "unassigned");
});

test("7. ambiguous visit (clock activity with no caregiver on record) maps to unknown rather than guessed", () => {
  const status = determineVisitStatus({
    removed: false,
    hasCaregiver: false,
    clockInTime: "2026-01-15T15:00:00.000Z",
    clockOutTime: null,
  });
  assert.equal(status, "unknown");
});

test("7b. ambiguous: clocked out with no caregiver on record also maps to unknown", () => {
  const status = determineVisitStatus({
    removed: false,
    hasCaregiver: false,
    clockInTime: null,
    clockOutTime: "2026-01-15T16:00:00.000Z",
  });
  assert.equal(status, "unknown");
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
