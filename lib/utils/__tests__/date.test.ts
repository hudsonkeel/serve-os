import assert from "node:assert/strict";
import {
  formatCentralDateTime,
  formatPlainDate,
  isBusinessDateDueTodayOrEarlier,
  isBusinessDateOnly,
  isBusinessDateOverdue,
} from "../date.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("formats an ISO instant as 'Mon D, YYYY at H:MM AM/PM' in Central time", () => {
  // 2026-08-14T19:07:00Z = 2:07 PM Central (CDT, UTC-5) in August.
  const result = formatCentralDateTime("2026-08-14T19:07:00.000Z");
  assert.equal(result, "Aug 14, 2026 at 2:07 PM");
});

test("returns null for an unparseable input rather than throwing or showing 'Invalid Date'", () => {
  assert.equal(formatCentralDateTime("not-a-date"), null);
});

test("handles midnight/noon boundaries correctly", () => {
  // Midnight Central (CDT, UTC-5) = 05:00Z
  assert.equal(formatCentralDateTime("2026-08-15T05:00:00.000Z"), "Aug 15, 2026 at 12:00 AM");
  // Noon Central = 17:00Z
  assert.equal(formatCentralDateTime("2026-08-15T17:00:00.000Z"), "Aug 15, 2026 at 12:00 PM");
});

// ─── Business calendar dates (Incident Corrective Action Lifecycle v0.1) ──
// Regression coverage for the date-only timezone bug confirmed in live
// validation: a due_at equal to today's own calendar date must never read
// as overdue-by-a-day, and formatPlainDate must never shift a date-only
// value when converting it for display, regardless of the host process's
// local timezone.

// 2026-09-24T18:00:00Z = 1:00 PM Central (CDT, UTC-5) — safely mid-
// afternoon on Sep 24, Central, so there is no ambiguity about which
// Central calendar day "now" falls on.
const NOW = new Date("2026-09-24T18:00:00.000Z");

test("isBusinessDateOverdue: yesterday's calendar date is overdue", () => {
  assert.equal(isBusinessDateOverdue("2026-09-23", NOW), true);
});

test("isBusinessDateOverdue: today's own calendar date is NOT overdue (the exact regression this exists to fix)", () => {
  assert.equal(isBusinessDateOverdue("2026-09-24", NOW), false);
});

test("isBusinessDateOverdue: tomorrow's calendar date is NOT overdue", () => {
  assert.equal(isBusinessDateOverdue("2026-09-25", NOW), false);
});

test("isBusinessDateDueTodayOrEarlier: yesterday counts as due (or earlier)", () => {
  assert.equal(isBusinessDateDueTodayOrEarlier("2026-09-23", NOW), true);
});

test("isBusinessDateDueTodayOrEarlier: today counts as due", () => {
  assert.equal(isBusinessDateDueTodayOrEarlier("2026-09-24", NOW), true);
});

test("isBusinessDateDueTodayOrEarlier: tomorrow does NOT count as due yet", () => {
  assert.equal(isBusinessDateDueTodayOrEarlier("2026-09-25", NOW), false);
});

test("isBusinessDateOverdue/DueTodayOrEarlier are stable across the UTC midnight boundary — a 'now' just after UTC midnight but still Central-evening-before must not treat today's date as tomorrow's", () => {
  // 2026-09-25T02:00:00Z = 9:00 PM Central on Sep 24 (CDT, UTC-5) — past
  // UTC midnight, but still Sep 24 in Central time.
  const lateUtcStillSameCentralDay = new Date("2026-09-25T02:00:00.000Z");
  assert.equal(isBusinessDateOverdue("2026-09-24", lateUtcStillSameCentralDay), false);
  assert.equal(isBusinessDateDueTodayOrEarlier("2026-09-24", lateUtcStillSameCentralDay), true);
});

test("formatPlainDate: never shifts the calendar date regardless of month style or year inclusion", () => {
  assert.equal(formatPlainDate("2026-09-24"), "Sep 24, 2026");
  assert.equal(formatPlainDate("2026-09-24", { monthStyle: "long" }), "September 24, 2026");
  assert.equal(formatPlainDate("2026-09-24", { includeYear: false }), "Sep 24");
  assert.equal(formatPlainDate("2026-09-24", { monthStyle: "long", includeYear: false }), "September 24");
});

test("formatPlainDate: the exact live-validation regression — Sep 24 must never render as Sep 23", () => {
  assert.equal(formatPlainDate("2026-09-24"), "Sep 24, 2026");
  assert.notEqual(formatPlainDate("2026-09-24"), "Sep 23, 2026");
});

test("isBusinessDateOnly: recognizes a bare YYYY-MM-DD date column value", () => {
  assert.equal(isBusinessDateOnly("2026-09-24"), true);
});

test("isBusinessDateOnly: rejects a full timestamptz instant, even one starting with the same date", () => {
  assert.equal(isBusinessDateOnly("2026-09-24T00:00:00.000Z"), false);
  assert.equal(isBusinessDateOnly("2026-09-24T18:00:00+00:00"), false);
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
