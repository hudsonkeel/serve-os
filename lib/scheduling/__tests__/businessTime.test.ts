// Pure-function tests for lib/scheduling/businessTime.ts. Run with:
//   npm run test:scheduling
import assert from "node:assert/strict";
import {
  businessDateToUtcWindow,
  businessDateRangeToUtcWindow,
  utcInstantToBusinessDate,
  businessDateDaysBefore,
} from "../businessTime.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── Ordinary dates ──────────────────────────────────────────────────────

test("ordinary CDT (summer) date: midnight Central = 05:00 UTC", () => {
  const window = businessDateToUtcWindow("2026-07-15");
  assert.equal(window.startUtc, "2026-07-15T05:00:00.000Z");
  assert.equal(window.endUtcExclusive, "2026-07-16T05:00:00.000Z");
});

test("ordinary CST (winter) date: midnight Central = 06:00 UTC", () => {
  const window = businessDateToUtcWindow("2026-01-15");
  assert.equal(window.startUtc, "2026-01-15T06:00:00.000Z");
  assert.equal(window.endUtcExclusive, "2026-01-16T06:00:00.000Z");
});

// ─── DST transitions ─────────────────────────────────────────────────────
//
// 2026 US DST: spring-forward March 8 (2:00am -> 3:00am), fall-back
// November 1 (2:00am -> 1:00am). Local midnight on either transition date
// itself falls outside the skipped/repeated hour, but converting "local
// midnight" to UTC still depends on which offset is in effect at the
// anchor instant used internally — the same documented, accepted
// approximation lib/scheduling/dateTime.ts's parseWallClockInZone already
// uses for this exact class of edge case ("resolves it using the offset
// in effect at the approximate instant"). These tests assert the window
// is well-formed and of a sane duration, not a specific offset, since the
// exact boundary is this shared, pre-existing, documented limitation.
test("spring-forward transition date produces a well-formed, sane window", () => {
  const window = businessDateToUtcWindow("2026-03-08");
  const hours = (Date.parse(window.endUtcExclusive) - Date.parse(window.startUtc)) / 3_600_000;
  assert.ok(hours >= 22 && hours <= 26, `expected a sane ~24h window, got ${hours}h`);
  assert.ok(Date.parse(window.endUtcExclusive) > Date.parse(window.startUtc));
});

test("fall-back transition date produces a well-formed, sane window", () => {
  const window = businessDateToUtcWindow("2026-11-01");
  const hours = (Date.parse(window.endUtcExclusive) - Date.parse(window.startUtc)) / 3_600_000;
  assert.ok(hours >= 22 && hours <= 26, `expected a sane ~24h window, got ${hours}h`);
  assert.ok(Date.parse(window.endUtcExclusive) > Date.parse(window.startUtc));
});

// ─── Multi-day range ─────────────────────────────────────────────────────

test("multi-day range spans exactly from the first day's start to the last day's end", () => {
  const range = businessDateRangeToUtcWindow("2026-09-05", "2026-09-07");
  const singleStart = businessDateToUtcWindow("2026-09-05");
  const singleEnd = businessDateToUtcWindow("2026-09-07");
  assert.equal(range.startUtc, singleStart.startUtc);
  assert.equal(range.endUtcExclusive, singleEnd.endUtcExclusive);
  // No DST transition in this range: exactly 3 full 24h days.
  const hours = (Date.parse(range.endUtcExclusive) - Date.parse(range.startUtc)) / 3_600_000;
  assert.equal(hours, 72);
});

// ─── Exclusive end boundary ──────────────────────────────────────────────

test("end boundary is exclusive: it equals the start of the following business date, not the last moment of the range", () => {
  const range = businessDateToUtcWindow("2026-09-07");
  const nextDay = businessDateToUtcWindow("2026-09-08");
  assert.equal(range.endUtcExclusive, nextDay.startUtc);
});

// ─── No implicit system-local timezone dependency ───────────────────────

test("result is identical regardless of the process's local TZ", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Auckland";
    const window = businessDateToUtcWindow("2026-07-15");
    assert.equal(window.startUtc, "2026-07-15T05:00:00.000Z");
    assert.equal(window.endUtcExclusive, "2026-07-16T05:00:00.000Z");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

// ─── utcInstantToBusinessDate ────────────────────────────────────────────

test("utcInstantToBusinessDate resolves a late-UTC instant to the correct earlier Central business date", () => {
  // 2026-09-08T04:30:00Z is 2026-09-07 23:30 Central (CDT, UTC-5) — still Sept 7 locally.
  assert.equal(utcInstantToBusinessDate("2026-09-08T04:30:00.000Z"), "2026-09-07");
});

test("utcInstantToBusinessDate resolves an ordinary daytime UTC instant to the same-day Central business date", () => {
  assert.equal(utcInstantToBusinessDate("2026-07-15T18:00:00.000Z"), "2026-07-15");
});

// ─── businessDateDaysBefore ──────────────────────────────────────────────

test("businessDateDaysBefore does calendar-only subtraction across a month boundary", () => {
  assert.equal(businessDateDaysBefore("2026-09-08", 6), "2026-09-02");
  assert.equal(businessDateDaysBefore("2026-09-03", 6), "2026-08-28");
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
