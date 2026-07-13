// Tests for lib/scheduling/format.ts — the pure display-formatting helpers
// behind Workspace's live Today's Schedule panel. Uses the same
// hand-rolled test-runner convention as this folder's other test files.
// Run with:
//
//   npm run test:scheduling
//
// All fixtures are fictional. No live API call is made by this file.
import assert from "node:assert/strict";
import {
  formatUpdatedAt,
  formatVisitTimeRange,
  sortVisitsByScheduledStart,
  STATUS_BADGE_TONE,
  STATUS_LABELS,
  UNAVAILABLE_SCHEDULE_COPY,
} from "../format.ts";
import type { ServeScheduleVisit } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function fictionalVisit(overrides: Partial<ServeScheduleVisit>): ServeScheduleVisit {
  return {
    externalVisitId: "fict-visit",
    sourceSystem: "axiscare",
    resident: { externalId: "fict-client", displayName: "Fictional Resident" },
    caregiver: { externalId: "fict-caregiver", displayName: "Fictional Caregiver" },
    service: null,
    scheduledStart: "2026-01-15T15:00:00.000Z",
    scheduledEnd: "2026-01-15T16:00:00.000Z",
    actualStart: null,
    actualEnd: null,
    timezone: "America/Chicago",
    visitType: null,
    status: "scheduled",
    assigned: true,
    verified: false,
    removed: false,
    modificationReason: null,
    careModel: "unknown",
    provenanceConfidence: "unknown",
    ...overrides,
  };
}

// ─── Status label / badge tone mapping (Part H, O#6/O#7) ────────────────

test("STATUS_LABELS maps completed and in_progress to their required UI labels", () => {
  assert.equal(STATUS_LABELS.completed, "Completed");
  assert.equal(STATUS_LABELS.in_progress, "In Progress");
  assert.equal(STATUS_LABELS.scheduled, "Scheduled");
  assert.equal(STATUS_LABELS.unassigned, "Unassigned");
  assert.equal(STATUS_LABELS.removed, "Removed");
  assert.equal(STATUS_LABELS.unknown, "Status Unknown");
});

test("STATUS_BADGE_TONE does not rely on a single tone for every status (restrained but distinguishable)", () => {
  const distinctTones = new Set(Object.values(STATUS_BADGE_TONE));
  assert.ok(distinctTones.size >= 3);
  assert.equal(STATUS_BADGE_TONE.unassigned, "warning");
  assert.equal(STATUS_BADGE_TONE.in_progress, "blue");
  assert.equal(STATUS_BADGE_TONE.completed, "success");
});

// ─── Fallback copy (Part K, O#9-O#12) ────────────────────────────────────

test("UNAVAILABLE_SCHEDULE_COPY provides safe, non-raw copy for every unavailable reason", () => {
  const reasons: (keyof typeof UNAVAILABLE_SCHEDULE_COPY)[] = [
    "not_configured",
    "authentication",
    "authorization",
    "timeout",
    "upstream_unavailable",
    "invalid_response",
    "unknown",
  ];
  for (const reason of reasons) {
    const copy = UNAVAILABLE_SCHEDULE_COPY[reason];
    assert.ok(copy.length > 0);
    // Never leaks stack-trace or vendor-error shaped text.
    assert.ok(!copy.toLowerCase().includes("stack"));
    assert.ok(!copy.toLowerCase().includes("axios"));
    assert.ok(!copy.toLowerCase().includes("fetch failed"));
  }
  assert.equal(
    UNAVAILABLE_SCHEDULE_COPY.not_configured,
    "AxisCare scheduling is not configured."
  );
  assert.equal(
    UNAVAILABLE_SCHEDULE_COPY.authentication,
    "Serve OS could not authenticate with AxisCare."
  );
  assert.equal(
    UNAVAILABLE_SCHEDULE_COPY.timeout,
    UNAVAILABLE_SCHEDULE_COPY.upstream_unavailable
  );
});

// ─── Chronological ordering (Part G, O#5) ────────────────────────────────

test("sortVisitsByScheduledStart orders assigned visits ascending by scheduledStart", () => {
  const visits = [
    fictionalVisit({ externalVisitId: "v3", scheduledStart: "2026-01-15T20:00:00.000Z" }),
    fictionalVisit({ externalVisitId: "v1", scheduledStart: "2026-01-15T13:00:00.000Z" }),
    fictionalVisit({ externalVisitId: "v2", scheduledStart: "2026-01-15T15:00:00.000Z" }),
  ];
  const sorted = sortVisitsByScheduledStart(visits);
  assert.deepEqual(
    sorted.map((v) => v.externalVisitId),
    ["v1", "v2", "v3"]
  );
});

test("sortVisitsByScheduledStart pushes unparseable (empty) scheduledStart to the end", () => {
  const visits = [
    fictionalVisit({ externalVisitId: "v-unparseable", scheduledStart: "" }),
    fictionalVisit({ externalVisitId: "v1", scheduledStart: "2026-01-15T13:00:00.000Z" }),
  ];
  const sorted = sortVisitsByScheduledStart(visits);
  assert.deepEqual(
    sorted.map((v) => v.externalVisitId),
    ["v1", "v-unparseable"]
  );
});

test("sortVisitsByScheduledStart does not mutate the input array", () => {
  const visits = [
    fictionalVisit({ externalVisitId: "v2", scheduledStart: "2026-01-15T15:00:00.000Z" }),
    fictionalVisit({ externalVisitId: "v1", scheduledStart: "2026-01-15T13:00:00.000Z" }),
  ];
  sortVisitsByScheduledStart(visits);
  assert.equal(visits[0].externalVisitId, "v2");
});

// ─── Empty active schedule (O#8) ──────────────────────────────────────────

test("sortVisitsByScheduledStart on an empty list returns an empty list", () => {
  assert.deepEqual(sortVisitsByScheduledStart([]), []);
});

// ─── Time formatting, timezone-safe (Part I, O#15) ───────────────────────

test("formatVisitTimeRange renders a Central-time visit without a zone note (winter/CST)", () => {
  const display = formatVisitTimeRange(
    "2026-01-15T14:00:00.000Z",
    "2026-01-15T16:00:00.000Z",
    "America/Chicago"
  );
  assert.equal(display.range, "8:00 AM–10:00 AM");
  assert.equal(display.zoneNote, null);
});

test("formatVisitTimeRange renders a Central-time visit without a zone note (summer/CDT)", () => {
  const display = formatVisitTimeRange(
    "2026-07-15T13:00:00.000Z",
    "2026-07-15T15:00:00.000Z",
    "America/Chicago"
  );
  assert.equal(display.range, "8:00 AM–10:00 AM");
  assert.equal(display.zoneNote, null);
});

test("formatVisitTimeRange treats the live-confirmed 'US/Central' alias the same as America/Chicago", () => {
  const display = formatVisitTimeRange(
    "2026-01-15T14:00:00.000Z",
    "2026-01-15T16:00:00.000Z",
    "US/Central"
  );
  assert.equal(display.zoneNote, null);
});

test("formatVisitTimeRange falls back to America/Chicago when timezone is null", () => {
  const display = formatVisitTimeRange(
    "2026-01-15T14:00:00.000Z",
    "2026-01-15T16:00:00.000Z",
    null
  );
  assert.equal(display.range, "8:00 AM–10:00 AM");
  assert.equal(display.zoneNote, null);
});

test("formatVisitTimeRange surfaces a zone note for a genuinely different timezone", () => {
  const display = formatVisitTimeRange(
    "2026-01-15T14:00:00.000Z",
    "2026-01-15T16:00:00.000Z",
    "America/New_York"
  );
  assert.equal(display.zoneNote, "America/New_York");
});

test("formatVisitTimeRange reports 'Time unavailable' for an unparseable scheduledStart/End", () => {
  const display = formatVisitTimeRange("", "2026-01-15T16:00:00.000Z", "America/Chicago");
  assert.equal(display.range, "Time unavailable");
  assert.equal(display.zoneNote, null);
});

// ─── Updated-at formatting (Part D) ──────────────────────────────────────

test("formatUpdatedAt renders in Central time with a CT suffix, never raw UTC", () => {
  const label = formatUpdatedAt("2026-01-15T14:30:00.000Z");
  assert.equal(label, "Updated 8:30 AM CT");
  assert.ok(!label.includes("Z"));
});

test("formatUpdatedAt fails safely on an invalid timestamp", () => {
  assert.equal(formatUpdatedAt("not-a-date"), "Updated time unavailable");
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
