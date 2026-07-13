// Pure-function tests for lib/scheduling/dateTime.ts, using the same
// lightweight convention as lib/integrations/axiscare/__tests__/
// sanitization.test.ts (no unit-test framework in this repo). Run with:
//
//   npm run test:scheduling
//
// All fixtures are fictional wall-clock times, not real visit data.
import assert from "node:assert/strict";
import { parseAxisCareDateTime, parseWallClockInZone } from "../dateTime.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("parseAxisCareDateTime handles an explicit Z offset as-is", () => {
  const result = parseAxisCareDateTime("2026-01-15T15:00:00Z", "America/Chicago");
  assert.equal(result, "2026-01-15T15:00:00.000Z");
});

test("parseAxisCareDateTime handles an explicit +HH:MM offset as-is", () => {
  // 09:00 at UTC-06:00 is 15:00 UTC.
  const result = parseAxisCareDateTime("2026-01-15T09:00:00-06:00", "America/Chicago");
  assert.equal(result, "2026-01-15T15:00:00.000Z");
});

test("parseAxisCareDateTime interprets a naive string as Central Standard Time (winter, UTC-6)", () => {
  // January is CST (UTC-6): 09:00 Central -> 15:00 UTC.
  const result = parseAxisCareDateTime("2026-01-15T09:00:00", "America/Chicago");
  assert.equal(result, "2026-01-15T15:00:00.000Z");
});

test("parseAxisCareDateTime interprets a naive string as Central Daylight Time (summer, UTC-5) — DST boundary", () => {
  // July is CDT (UTC-5): 09:00 Central -> 14:00 UTC. This must differ
  // from the winter case above by exactly one hour, proving the DST rule
  // is being applied per-date rather than a fixed offset.
  const result = parseAxisCareDateTime("2026-07-15T09:00:00", "America/Chicago");
  assert.equal(result, "2026-07-15T14:00:00.000Z");
});

test("parseAxisCareDateTime honors a non-Central timezone when the visit specifies one", () => {
  // A visit's own `timezone` field should take precedence over the
  // Central fallback. 09:00 Eastern (winter, UTC-5) -> 14:00 UTC.
  const result = parseAxisCareDateTime("2026-01-15T09:00:00", "America/New_York");
  assert.equal(result, "2026-01-15T14:00:00.000Z");
});

test("parseAxisCareDateTime falls back to Central Time when no timezone is passed", () => {
  const result = parseAxisCareDateTime("2026-01-15T09:00:00");
  assert.equal(result, "2026-01-15T15:00:00.000Z");
});

test("parseAxisCareDateTime returns null for missing or empty input", () => {
  assert.equal(parseAxisCareDateTime(null), null);
  assert.equal(parseAxisCareDateTime(undefined), null);
  assert.equal(parseAxisCareDateTime(""), null);
  assert.equal(parseAxisCareDateTime("   "), null);
});

test("parseAxisCareDateTime returns null for an unparseable string rather than guessing", () => {
  assert.equal(parseAxisCareDateTime("not-a-date"), null);
  assert.equal(parseAxisCareDateTime("2026-13-99"), null);
});

test("parseWallClockInZone returns null for a malformed naive string", () => {
  assert.equal(parseWallClockInZone("garbage", "America/Chicago"), null);
});

test("DST boundary: the same wall-clock hour across the spring-forward transition still parses correctly on both sides", () => {
  // 2026-03-08 is the US spring-forward date. 09:00 the day before is
  // still CST (UTC-6); 09:00 the day after is CDT (UTC-5).
  const before = parseAxisCareDateTime("2026-03-07T09:00:00", "America/Chicago");
  const after = parseAxisCareDateTime("2026-03-09T09:00:00", "America/Chicago");
  assert.equal(before, "2026-03-07T15:00:00.000Z");
  assert.equal(after, "2026-03-09T14:00:00.000Z");
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
