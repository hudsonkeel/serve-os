// Pure-function tests for lib/residentTimeline/grouping.ts. Run with:
//   npm run test:residentTimeline
import assert from "node:assert/strict";
import { groupTimelineEventsByDay } from "../grouping.ts";
import type { ResidentTimelineEvent } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function makeEvent(
  overrides: Partial<ResidentTimelineEvent> = {}
): ResidentTimelineEvent {
  return {
    id: "event-id",
    residentId: "resident-id",
    eventType: "working_note_created",
    eventTitle: "Working note added",
    eventDescription: null,
    source: "resident_working_notes",
    createdAt: "2026-07-16T15:00:00.000Z",
    createdBy: "Hud Keel",
    systemGenerated: true,
    ...overrides,
  };
}

// Reference "now" fixed at noon Central on 2026-07-16 so Today/Yesterday
// are deterministic across the test suite.
const REFERENCE = new Date("2026-07-16T17:00:00.000Z");

test("1. groups a same-day event as Today", () => {
  const groups = groupTimelineEventsByDay(
    [makeEvent({ createdAt: "2026-07-16T15:00:00.000Z" })],
    REFERENCE
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Today");
  assert.equal(groups[0].events.length, 1);
});

test("2. groups the prior Central calendar day as Yesterday", () => {
  const groups = groupTimelineEventsByDay(
    [makeEvent({ createdAt: "2026-07-15T20:00:00.000Z" })],
    REFERENCE
  );
  assert.equal(groups[0].label, "Yesterday");
});

test("3. uses a full date label for older events", () => {
  const groups = groupTimelineEventsByDay(
    [makeEvent({ createdAt: "2026-01-02T12:00:00.000Z" })],
    REFERENCE
  );
  assert.equal(groups[0].label, "January 2, 2026");
});

test("4. groups consecutive same-day events under one heading", () => {
  const groups = groupTimelineEventsByDay(
    [
      makeEvent({ id: "a", createdAt: "2026-07-16T18:00:00.000Z" }),
      makeEvent({ id: "b", createdAt: "2026-07-16T13:00:00.000Z" }),
    ],
    REFERENCE
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].events.length, 2);
  assert.deepEqual(
    groups[0].events.map((e) => e.id),
    ["a", "b"]
  );
});

test("5. starts a new group when the day changes, preserving input order", () => {
  const groups = groupTimelineEventsByDay(
    [
      makeEvent({ id: "today", createdAt: "2026-07-16T15:00:00.000Z" }),
      makeEvent({ id: "yesterday", createdAt: "2026-07-15T15:00:00.000Z" }),
    ],
    REFERENCE
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Today", "Yesterday"]
  );
});

test("6. returns no groups for an empty event list", () => {
  assert.deepEqual(groupTimelineEventsByDay([], REFERENCE), []);
});

test("7. a Central-time evening event before UTC midnight still falls on the correct day", () => {
  // 2026-07-16 23:30 Central (CDT, UTC-5) is 2026-07-17 04:30 UTC — still
  // "Today" relative to a Central reference date of 2026-07-16.
  const groups = groupTimelineEventsByDay(
    [makeEvent({ createdAt: "2026-07-17T04:30:00.000Z" })],
    REFERENCE
  );
  assert.equal(groups[0].label, "Today");
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
