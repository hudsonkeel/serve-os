// Pure-function tests for lib/wellnessFollowUps/validation.ts. Run with:
//   npm run test:wellnessFollowUps
import assert from "node:assert/strict";
import {
  isValidFollowUpType,
  isValidPriority,
  normalizeAssignedTo,
  normalizeFollowUpTitle,
  parseFollowUpDueDate,
  validateFollowUpDueDateNotPast,
} from "../validation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── title ───────────────────────────────────────────────────────────

test("1. normalizeFollowUpTitle trims whitespace", () => {
  const result = normalizeFollowUpTitle("  Resident Check-in  ");
  assert.equal(result.title, "Resident Check-in");
  assert.equal(result.error, undefined);
});

test("2. normalizeFollowUpTitle rejects a blank title", () => {
  const result = normalizeFollowUpTitle("   ");
  assert.equal(result.title, undefined);
  assert.ok(result.error);
});

// ─── type / priority guards ────────────────────────────────────────────

test("3. isValidFollowUpType accepts known values, rejects unknown", () => {
  assert.equal(isValidFollowUpType("resident_check_in"), true);
  assert.equal(isValidFollowUpType("not_a_real_type"), false);
});

test("4. isValidPriority accepts known values, rejects unknown", () => {
  assert.equal(isValidPriority("urgent"), true);
  assert.equal(isValidPriority("critical"), false);
});

// ─── due date parsing ───────────────────────────────────────────────────

test("5. parseFollowUpDueDate returns null iso for an empty value (cleared)", () => {
  const result = parseFollowUpDueDate(undefined);
  assert.equal(result.iso, null);
  assert.equal(result.error, undefined);
});

test("6. parseFollowUpDueDate parses a valid date to ISO", () => {
  const result = parseFollowUpDueDate("2026-07-21");
  assert.ok(result.iso?.startsWith("2026-07-21"));
});

test("7. parseFollowUpDueDate rejects an invalid date string", () => {
  const result = parseFollowUpDueDate("not-a-date");
  assert.equal(result.iso, undefined);
  assert.ok(result.error);
});

// ─── past-due-date validation ───────────────────────────────────────────

const NOW = new Date("2026-07-16T12:00:00.000Z");

test("8. allows a new future due date", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-21T00:00:00.000Z",
    "2026-07-14T00:00:00.000Z",
    NOW
  );
  assert.equal(result.error, undefined);
});

test("9. rejects a newly-chosen past due date", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-01T00:00:00.000Z",
    "2026-07-14T00:00:00.000Z",
    NOW
  );
  assert.ok(result.error);
});

test("10. allows an unchanged due date even if it has since passed", () => {
  // The follow-up was created with a due date that is now in the past —
  // editing some other field shouldn't force the date to be pushed out.
  const result = validateFollowUpDueDateNotPast(
    "2026-07-10T00:00:00.000Z",
    "2026-07-10T00:00:00.000Z",
    NOW
  );
  assert.equal(result.error, undefined);
});

test("11. allows clearing the due date entirely", () => {
  const result = validateFollowUpDueDateNotPast(null, "2026-07-10T00:00:00.000Z", NOW);
  assert.equal(result.error, undefined);
});

test("12. allows a due date of exactly now", () => {
  const result = validateFollowUpDueDateNotPast(
    NOW.toISOString(),
    "2026-07-01T00:00:00.000Z",
    NOW
  );
  assert.equal(result.error, undefined);
});

// ─── assignee ────────────────────────────────────────────────────────

test("13. normalizeAssignedTo trims and treats blank as unassigned", () => {
  assert.equal(normalizeAssignedTo("  Elizabeth Butler  "), "Elizabeth Butler");
  assert.equal(normalizeAssignedTo("   "), null);
  assert.equal(normalizeAssignedTo(undefined), null);
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
