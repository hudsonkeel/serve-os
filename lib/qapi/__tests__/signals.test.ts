// Pure-function tests for ../signals.ts — no database, exercises the
// compute*Signals() functions directly with fixture rows, matching
// lib/compliance/__tests__/correctiveActionComposition.test.ts's
// established convention. Run with:
//   node --experimental-strip-types --conditions=react-server lib/qapi/__tests__/signals.test.ts
import assert from "node:assert/strict";
import { computeCorrectiveWorkSignals, computeIncidentSignals, computeInfectionSignals, medianDays, withinDays } from "../signals.ts";
import type { Incident, Infection } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const NOW = new Date("2026-08-31T12:00:00.000Z");

function incident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "i1",
    community_id: "c1",
    resident_id: "r1",
    workforce_member_id: null,
    occurred_at: "2026-08-01T00:00:00.000Z",
    location: null,
    incident_type: "fall",
    incident_type_other: null,
    description: "Fell in the hallway.",
    immediate_response: null,
    injury_occurred: false,
    injury_medical_details: null,
    parties_notified: [],
    follow_up_required: false,
    owner: null,
    notes: null,
    review_status: "not_reviewed",
    reviewed_by: null,
    reviewed_at: null,
    status: "open",
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
    created_by: "Jordan Lee",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_by: null,
    updated_at: null,
    ...overrides,
  };
}

function infection(overrides: Partial<Infection> = {}): Infection {
  return {
    id: "inf1",
    community_id: "c1",
    resident_id: "r1",
    disclosed_at: "2026-08-01",
    condition_description: "Shingles.",
    treatment_description: null,
    disclosed_by: null,
    follow_up_required: false,
    owner: null,
    notes: null,
    review_status: "not_reviewed",
    reviewed_by: null,
    reviewed_at: null,
    status: "open",
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
    created_by: "Jordan Lee",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_by: null,
    updated_at: null,
    ...overrides,
  };
}

test("1. withinDays: exactly on the boundary counts as within", () => {
  assert.equal(withinDays("2026-08-01T12:00:00.000Z", 30, NOW), true);
});

test("2. withinDays: outside the window is false", () => {
  assert.equal(withinDays("2026-01-01T00:00:00.000Z", 30, NOW), false);
});

test("3. medianDays: empty array -> null, never zero", () => {
  assert.equal(medianDays([]), null);
});

test("4. medianDays: odd count picks the middle value", () => {
  assert.equal(medianDays([1, 5, 3]), 3);
});

test("5. medianDays: even count averages the two middle values", () => {
  assert.equal(medianDays([1, 2, 3, 4]), 2.5);
});

test("6. computeIncidentSignals: counts open/needs-review/resolved correctly", () => {
  const rows = [
    incident({ id: "a", status: "open", review_status: "not_reviewed" }),
    incident({ id: "b", status: "open", review_status: "reviewed" }),
    incident({ id: "c", status: "resolved", review_status: "reviewed", resolved_at: "2026-08-20T00:00:00.000Z" }),
  ];
  const signals = computeIncidentSignals(rows, NOW);
  assert.equal(signals.totalOpen, 2);
  assert.equal(signals.totalNeedsReview, 1);
  assert.equal(signals.totalResolved, 1);
});

test("7. computeIncidentSignals: rolling windows and byType grouping", () => {
  const rows = [
    incident({ id: "a", incident_type: "fall", occurred_at: "2026-08-25T00:00:00.000Z" }), // within 30d
    incident({ id: "b", incident_type: "fall", occurred_at: "2026-07-15T00:00:00.000Z" }), // within 90d, not 30d
    incident({ id: "c", incident_type: "injury", occurred_at: "2025-01-01T00:00:00.000Z" }), // outside both
  ];
  const signals = computeIncidentSignals(rows, NOW);
  assert.equal(signals.last30Days, 1);
  assert.equal(signals.last90Days, 2);
  assert.equal(signals.byType.fall, 2);
  assert.equal(signals.byType.injury, 1);
});

test("8. computeIncidentSignals: injuryOccurredCount and no Finding-shaped field exists on the result", () => {
  const rows = [incident({ id: "a", injury_occurred: true }), incident({ id: "b", injury_occurred: false })];
  const signals = computeIncidentSignals(rows, NOW);
  assert.equal(signals.injuryOccurredCount, 1);
  assert.equal("finding" in signals, false);
  assert.equal("severity" in signals, false);
});

test("9. computeIncidentSignals: unreviewed record contributes nothing to median entry-to-review", () => {
  const rows = [incident({ id: "a", review_status: "not_reviewed", reviewed_at: null })];
  const signals = computeIncidentSignals(rows, NOW);
  assert.equal(signals.medianEntryToReviewDays, null);
});

test("10. computeIncidentSignals: entry-to-review measures created_at -> reviewed_at, not occurred_at", () => {
  const rows = [
    incident({
      id: "a",
      occurred_at: "2026-08-01T00:00:00.000Z", // 10 days before created_at — must NOT be used in the latency calc
      created_at: "2026-08-11T00:00:00.000Z",
      review_status: "reviewed",
      reviewed_at: "2026-08-13T00:00:00.000Z", // 2 days after created_at
    }),
  ];
  const signals = computeIncidentSignals(rows, NOW);
  assert.equal(signals.medianEntryToReviewDays, 2);
});

test("11. computeInfectionSignals: works identically off disclosed_at for windows", () => {
  const rows = [infection({ id: "a", disclosed_at: "2026-08-25" }), infection({ id: "b", disclosed_at: "2025-01-01" })];
  const signals = computeInfectionSignals(rows, NOW);
  assert.equal(signals.last30Days, 1);
});

test("12. computeCorrectiveWorkSignals: counts overdue and source-linked correctly, deterministically", () => {
  const rows = [
    { dueAt: "2026-08-01", sourceIncidentId: "i1", sourceInfectionId: null, sourceReviewItemId: null },
    { dueAt: "2026-12-01", sourceIncidentId: null, sourceInfectionId: null, sourceReviewItemId: null },
    { dueAt: null, sourceIncidentId: null, sourceInfectionId: "inf1", sourceReviewItemId: null },
  ];
  const signals = computeCorrectiveWorkSignals(rows, NOW);
  assert.equal(signals.totalOpen, 3);
  assert.equal(signals.overdueCount, 1);
  assert.equal(signals.sourceLinkedCount, 2);
});

test("13. sparse/empty input renders zero counts, not an error", () => {
  const signals = computeIncidentSignals([], NOW);
  assert.equal(signals.totalOpen, 0);
  assert.equal(signals.medianEntryToReviewDays, null);
  assert.deepEqual(signals.byType, {});
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
