// Pure-function tests for lib/wellnessFollowUps/validation.ts. Run with:
//   npm run test:wellnessFollowUps
import assert from "node:assert/strict";
import {
  isSameDueDateDay,
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

// ─── isSameDueDateDay ────────────────────────────────────────────────

test("8. isSameDueDateDay compares at calendar-day granularity, ignoring time-of-day", () => {
  assert.equal(isSameDueDateDay("2026-07-10T00:00:00.000Z", "2026-07-10T14:32:00.000Z"), true);
  assert.equal(isSameDueDateDay("2026-07-10T23:59:00.000Z", "2026-07-10T00:00:01.000Z"), true);
});

test("9. isSameDueDateDay returns false for a genuinely different day, or a null side", () => {
  assert.equal(isSameDueDateDay("2026-07-10T00:00:00.000Z", "2026-07-11T00:00:00.000Z"), false);
  assert.equal(isSameDueDateDay(null, "2026-07-10T00:00:00.000Z"), false);
  assert.equal(isSameDueDateDay("2026-07-10T00:00:00.000Z", null), false);
});

// ─── past-due-date validation (edit path) ────────────────────────────
//
// The REGRESSION this scope fixes: an EDIT to any field on an already-
// overdue follow-up must not be rejected just because the untouched due
// date's midnight-truncated resubmission doesn't byte-match the original
// stored instant. validateFollowUpDueDateNotPast only ever sees the two
// due-date values being compared — it has no visibility into which OTHER
// field changed — so "editing only the title/notes/priority/assignee"
// and "the due date itself is untouched" are the same input shape from
// this function's perspective. Tests 10-11 exercise that shape directly;
// the end-to-end claim that a real title/notes/priority/assignee-only
// save actually reaches the database is confirmed by live manual
// verification (see the completion report), not by this pure function
// alone, since editWellnessFollowUp/update_resident_wellness_follow_up
// require a database and aren't unit-tested here.

const NOW = new Date("2026-07-16T12:00:00.000Z");

test("10. existing overdue date at exact midnight + same submitted date -> accepted", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-10T00:00:00.000Z",
    "2026-07-10T00:00:00.000Z",
    NOW
  );
  assert.equal(result.error, undefined);
});

test("11. REGRESSION: existing overdue timestamp WITH a time-of-day component + same submitted calendar date -> accepted", () => {
  // Fixture: original due_at = 2026-07-10T14:32:00.000Z (overdue, 2:32pm
  // UTC — not midnight). The date-only <input> displays "2026-07-10" and,
  // left untouched, resubmits "2026-07-10T00:00:00.000Z". Before the fix,
  // this was rejected as "a newly chosen past date" purely because of the
  // time-of-day mismatch, even though the user never touched the date.
  const result = validateFollowUpDueDateNotPast(
    "2026-07-10T00:00:00.000Z",
    "2026-07-10T14:32:00.000Z",
    NOW
  );
  assert.equal(
    result.error,
    undefined,
    "expected the unchanged calendar day to be accepted, not rejected as a new past date"
  );
});

test("12. existing overdue date changed to a DIFFERENT past date -> rejected", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-01T00:00:00.000Z",
    "2026-07-10T14:32:00.000Z",
    NOW
  );
  assert.ok(result.error);
});

test("13. existing FUTURE date changed to a past date -> rejected", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-01T00:00:00.000Z",
    "2026-07-25T09:00:00.000Z", // was future relative to NOW
    NOW
  );
  assert.ok(result.error);
});

test("14. existing overdue date changed to TODAY -> accepted", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-16T00:00:00.000Z", // today, relative to NOW
    "2026-07-10T14:32:00.000Z", // was overdue
    NOW
  );
  assert.equal(result.error, undefined);
});

test("15. existing overdue date changed to a FUTURE date -> accepted", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-21T00:00:00.000Z",
    "2026-07-10T14:32:00.000Z", // was overdue
    NOW
  );
  assert.equal(result.error, undefined);
});

test("16. allows clearing the due date entirely", () => {
  const result = validateFollowUpDueDateNotPast(null, "2026-07-10T00:00:00.000Z", NOW);
  assert.equal(result.error, undefined);
});

test("17. allows a due date of exactly now", () => {
  const result = validateFollowUpDueDateNotPast(
    NOW.toISOString(),
    "2026-07-01T00:00:00.000Z",
    NOW
  );
  assert.equal(result.error, undefined);
});

// ─── "create"-shaped validation (no previous date) ───────────────────
//
// createManualWellnessFollowUp() (lib/actions/wellnessFollowUps.ts) does
// NOT currently call validateFollowUpDueDateNotPast at all — new
// follow-ups are inserted with whatever due_at is submitted, with no
// past-date rejection anywhere in the create path today. That gap
// predates this scope and is a distinct, separate feature question (not
// the overdue-EDIT regression this scope fixes), so it is deliberately
// left as-is here — see the completion report. These three tests instead
// pin down what the shared validator itself does when called with no
// previous value (previousIso = null, exactly a first-time/create-style
// call), so the function's own contract is fully specified regardless of
// whether the create path is ever wired up to use it.

test("18. no previous date + past date submitted -> rejected", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-01T00:00:00.000Z",
    null,
    NOW
  );
  assert.ok(result.error);
});

test("19. no previous date + due today -> accepted", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-07-16T00:00:00.000Z",
    null,
    NOW
  );
  assert.equal(result.error, undefined);
});

test("20. no previous date + future date -> accepted", () => {
  const result = validateFollowUpDueDateNotPast(
    "2026-08-01T00:00:00.000Z",
    null,
    NOW
  );
  assert.equal(result.error, undefined);
});

// ─── Central-time day-boundary behavior ──────────────────────────────
//
// The comparison is deliberately UTC-calendar-day (isSameDueDateDay
// slices the first 10 chars of the ISO string), not Central-time-day —
// and that's correct for THIS comparison, not an oversight. Both sides
// of the comparison are produced the same way: toDateInputValue() (the
// edit form) slices an ISO string's UTC date directly, and the <input
// type="date">'s resubmission is parsed as UTC midnight by spec. Central
// time is this app's convention for a *different* concern — bucketing
// "due today/this week" for dashboards (getCentralDayBoundaryUtc(), used
// by getWellnessFollowUpDashboardCounts()) — not for judging whether a
// date-only form field was actually touched. Using Central time here
// would create a mismatch with what the form itself round-trips.

test("21. an instant just before UTC midnight and one just after are treated as different days (documented convention)", () => {
  // 2026-07-10T23:59:00Z and 2026-07-11T00:01:00Z are ~7pm and ~7pm the
  // next evening in Central time (UTC-5 during CDT) — genuinely
  // different Central-time days too, so this case doesn't distinguish
  // the two conventions, but documents the boundary explicitly.
  assert.equal(isSameDueDateDay("2026-07-10T23:59:00.000Z", "2026-07-11T00:01:00.000Z"), false);
});

test("22. late-evening Central instants that share a UTC calendar day are treated as unchanged", () => {
  // 2026-07-10T04:00:00Z is 11pm Central on 2026-07-09 (CDT, UTC-5) — a
  // different Central-time day than 2026-07-10T14:32:00Z (9:32am
  // Central) despite sharing the same UTC calendar date. Per the
  // documented convention above, this compares as UNCHANGED (UTC date
  // match), which is correct here: it matches exactly what the date-only
  // form itself would resubmit for either instant (both slice to
  // "2026-07-10").
  assert.equal(isSameDueDateDay("2026-07-10T04:00:00.000Z", "2026-07-10T14:32:00.000Z"), true);
});

// ─── assignee ────────────────────────────────────────────────────────

test("23. normalizeAssignedTo trims and treats blank as unassigned", () => {
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
