// Pure-function tests for lib/intake/priority.ts. Run with:
//   npm run test:intake
import assert from "node:assert/strict";
import { categorizeTiming, determinePriorityRule } from "../priority.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// Tuesday 2026-07-14, 10:00 AM Central (UTC-5, CDT) = 15:00 UTC — a normal
// weekday business-hours instant.
const TUESDAY_MORNING = new Date("2026-07-14T15:00:00.000Z");
// Tuesday 2026-07-14, 8:00 PM Central = 01:00 UTC Wednesday — after hours.
const TUESDAY_EVENING = new Date("2026-07-15T01:00:00.000Z");
// Saturday 2026-07-18, noon Central = 17:00 UTC.
const SATURDAY_NOON = new Date("2026-07-18T17:00:00.000Z");
// Friday 2026-07-17, 8:00 PM Central = Saturday 01:00 UTC — after hours,
// rolling into the weekend.
const FRIDAY_EVENING = new Date("2026-07-18T01:00:00.000Z");

test("1. categorizeTiming recognizes immediate/urgent language", () => {
  assert.equal(categorizeTiming("Immediately"), "immediate");
  assert.equal(categorizeTiming("ASAP"), "immediate");
  assert.equal(categorizeTiming("as soon as possible"), "immediate");
});

test("2. categorizeTiming recognizes within-days language", () => {
  assert.equal(categorizeTiming("within a few days"), "within_days");
});

test("3. categorizeTiming recognizes planning-ahead language", () => {
  assert.equal(categorizeTiming("coming weeks"), "planning_ahead");
  assert.equal(categorizeTiming("Not sure"), "planning_ahead");
});

test("4. categorizeTiming returns unknown for blank/unrecognized input", () => {
  assert.equal(categorizeTiming(null), "unknown");
  assert.equal(categorizeTiming("purple elephant"), "unknown");
});

test("5. immediate timing during business hours -> urgent, same business day", () => {
  const result = determinePriorityRule("immediate", TUESDAY_MORNING);
  assert.equal(result.priority, "urgent");
  assert.equal(result.isSameBusinessDay, true);
  assert.equal(result.dueDateCentral, "2026-07-14");
});

test("6. immediate timing after hours -> urgent, next business day", () => {
  const result = determinePriorityRule("immediate", TUESDAY_EVENING);
  assert.equal(result.priority, "urgent");
  assert.equal(result.isSameBusinessDay, false);
  assert.equal(result.dueDateCentral, "2026-07-15");
});

test("7. immediate timing on a weekend -> urgent, rolls to next Monday", () => {
  const result = determinePriorityRule("immediate", SATURDAY_NOON);
  assert.equal(result.isSameBusinessDay, false);
  assert.equal(result.dueDateCentral, "2026-07-20"); // Monday
});

test("8. within_days timing -> high priority, next business day", () => {
  const result = determinePriorityRule("within_days", TUESDAY_MORNING);
  assert.equal(result.priority, "high");
  assert.equal(result.dueDateCentral, "2026-07-15");
});

test("9. planning_ahead timing -> normal priority, next business day", () => {
  const result = determinePriorityRule("planning_ahead", TUESDAY_MORNING);
  assert.equal(result.priority, "normal");
  assert.equal(result.dueDateCentral, "2026-07-15");
});

test("10. unknown timing -> normal priority (never silently dropped)", () => {
  const result = determinePriorityRule("unknown", TUESDAY_MORNING);
  assert.equal(result.priority, "normal");
});

test("11. Friday evening (after hours, before weekend) rolls to Monday, not Saturday", () => {
  const result = determinePriorityRule("within_days", FRIDAY_EVENING);
  assert.equal(result.dueDateCentral, "2026-07-20"); // Monday: 1 business day after Friday
});

test("12. same inputs always produce the same due date (deterministic)", () => {
  const a = determinePriorityRule("immediate", TUESDAY_MORNING);
  const b = determinePriorityRule("immediate", TUESDAY_MORNING);
  assert.deepEqual(a, b);
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
