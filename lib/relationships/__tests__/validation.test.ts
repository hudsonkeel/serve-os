// Pure-function tests for lib/relationships/validation.ts. Run with:
//   npm run test:relationships
import assert from "node:assert/strict";
import {
  normalizeActionTitle,
  normalizeDisplayName,
  normalizeOptionalText,
  normalizeTouchSummary,
  parseOptionalBoundedInteger,
  parseOptionalDate,
  parseOptionalDateOnly,
  validateDueDateNotPast,
} from "../validation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. normalizeDisplayName trims and rejects blank", () => {
  assert.equal(normalizeDisplayName("  Smith Family Inquiry  ").value, "Smith Family Inquiry");
  assert.ok(normalizeDisplayName("   ").error);
});

test("2. normalizeActionTitle trims and rejects blank", () => {
  assert.equal(normalizeActionTitle("  Call Jennifer  ").value, "Call Jennifer");
  assert.ok(normalizeActionTitle("").error);
});

test("3. normalizeTouchSummary trims and rejects blank", () => {
  assert.equal(
    normalizeTouchSummary("  Spoke with Cary about visits.  ").value,
    "Spoke with Cary about visits."
  );
  assert.ok(normalizeTouchSummary("").error);
});

test("4. parseOptionalDate returns null iso when nothing supplied", () => {
  const result = parseOptionalDate(undefined);
  assert.equal(result.iso, null);
  assert.equal(result.error, undefined);
});

test("5. parseOptionalDate parses a valid date", () => {
  const result = parseOptionalDate("2026-07-22");
  assert.ok(result.iso?.startsWith("2026-07-22"));
});

test("6. parseOptionalDate rejects an invalid date", () => {
  const result = parseOptionalDate("not-a-date");
  assert.ok(result.error);
});

test("7. validateDueDateNotPast rejects a newly-chosen past date", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const result = validateDueDateNotPast(
    "2026-07-01T00:00:00.000Z",
    "2026-07-20T00:00:00.000Z",
    now
  );
  assert.ok(result.error);
});

test("8. validateDueDateNotPast allows an unchanged past date", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const result = validateDueDateNotPast(
    "2026-07-01T00:00:00.000Z",
    "2026-07-01T00:00:00.000Z",
    now
  );
  assert.equal(result.error, undefined);
});

test("8b. validateDueDateNotPast allows an unchanged date even when the previous value carried a time-of-day component", () => {
  // Reproduces a real bug found via manual verification: editing any
  // field on an overdue action whose due_at was set with a precise
  // timestamp (e.g. via a script or RPC, not this date-only form) used
  // to be spuriously rejected, because the date-only <input> always
  // resubmits midnight UTC, which never byte-matched the original
  // instant even though the calendar day was untouched.
  const now = new Date("2026-07-17T12:00:00.000Z");
  const result = validateDueDateNotPast(
    "2026-07-16T00:00:00.000Z", // resubmitted by the date-only input
    "2026-07-16T05:31:38.968Z", // original precise timestamp, same day
    now
  );
  assert.equal(result.error, undefined);
});

test("8c. validateDueDateNotPast still rejects a genuinely different past date, time-of-day aside", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");
  const result = validateDueDateNotPast(
    "2026-07-10T00:00:00.000Z",
    "2026-07-16T05:31:38.968Z",
    now
  );
  assert.ok(result.error);
});

test("8d. validateDueDateNotPast allows changing an overdue date to TODAY", () => {
  // Second bug found alongside 8b/8c: comparing exact instants meant
  // "today" (always midnight, via the date-only input) was almost always
  // "less than" the current moment, so changing an overdue action's due
  // date to today was incorrectly rejected too. Fixed the same way as
  // lib/wellnessFollowUps/validation.ts's validateFollowUpDueDateNotPast.
  const now = new Date("2026-07-17T12:00:00.000Z");
  const result = validateDueDateNotPast(
    "2026-07-17T00:00:00.000Z", // today, submitted via the date-only input
    "2026-07-10T05:31:38.968Z", // was overdue
    now
  );
  assert.equal(result.error, undefined);
});

test("9. normalizeOptionalText trims and treats blank as null", () => {
  assert.equal(normalizeOptionalText("  Elizabeth Butler  "), "Elizabeth Butler");
  assert.equal(normalizeOptionalText("   "), null);
  assert.equal(normalizeOptionalText(undefined), null);
});

test("10. parseOptionalBoundedInteger returns null when blank", () => {
  const result = parseOptionalBoundedInteger(undefined, 0, 21, "Visits per week");
  assert.equal(result.value, null);
  assert.equal(result.error, undefined);
  assert.equal(parseOptionalBoundedInteger("", 0, 21, "Visits per week").value, null);
});

test("11. parseOptionalBoundedInteger accepts an in-range value", () => {
  assert.equal(parseOptionalBoundedInteger("3", 0, 21, "Visits per week").value, 3);
  assert.equal(parseOptionalBoundedInteger("0", 0, 21, "Visits per week").value, 0);
  assert.equal(parseOptionalBoundedInteger("21", 0, 21, "Visits per week").value, 21);
});

test("12. parseOptionalBoundedInteger rejects out-of-range values", () => {
  assert.ok(parseOptionalBoundedInteger("-1", 0, 21, "Visits per week").error);
  assert.ok(parseOptionalBoundedInteger("22", 0, 21, "Visits per week").error);
});

test("13. parseOptionalBoundedInteger rejects non-integer input", () => {
  assert.ok(parseOptionalBoundedInteger("3.5", 0, 21, "Visits per week").error);
  assert.ok(parseOptionalBoundedInteger("abc", 1, 1440, "Estimated visit duration").error);
});

test("14. estimated-visit-duration bounds (1-1440 minutes)", () => {
  assert.equal(parseOptionalBoundedInteger("45", 1, 1440, "Estimated visit duration").value, 45);
  assert.ok(parseOptionalBoundedInteger("0", 1, 1440, "Estimated visit duration").error);
  assert.ok(parseOptionalBoundedInteger("1441", 1, 1440, "Estimated visit duration").error);
});

test("15. parseOptionalDateOnly returns null iso when nothing supplied", () => {
  const result = parseOptionalDateOnly(undefined);
  assert.equal(result.iso, null);
  assert.equal(result.error, undefined);
});

test("16. parseOptionalDateOnly parses a valid date", () => {
  assert.equal(parseOptionalDateOnly("2026-08-01").iso, "2026-08-01");
});

test("17. parseOptionalDateOnly rejects an invalid date", () => {
  assert.ok(parseOptionalDateOnly("not-a-date").error);
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
