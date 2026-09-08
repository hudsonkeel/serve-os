// Pure-function tests for lib/scheduling/metrics/deliveryHours.ts
// (Financial Metric Registry #14 — Scheduled vs. Recorded Delivered Care
// Hours). Run with: npm run test:scheduling
import assert from "node:assert/strict";
import { calculateDeliveryHours, calculateDeliveryHoursRollup, type VisitFactForMetrics } from "../deliveryHours.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function visit(overrides: Partial<VisitFactForMetrics> = {}): VisitFactForMetrics {
  return {
    residentId: "fict-resident-1",
    communityId: "fict-community-1",
    caregiverWorkforceMemberId: "fict-caregiver-1",
    status: "completed",
    removed: false,
    scheduledStart: "2026-09-01T14:00:00.000Z",
    scheduledEnd: "2026-09-01T15:00:00.000Z",
    actualStart: "2026-09-01T14:00:00.000Z",
    actualEnd: "2026-09-01T15:00:00.000Z",
    ...overrides,
  };
}

// ─── Basic calculation ───────────────────────────────────────────────────

test("one exactly-on-time completed Visit: scheduled = delivered = 1 hour, variance 0, rate 100", () => {
  const result = calculateDeliveryHours([visit()]);
  assert.equal(result.scheduledCareHours, 1);
  assert.equal(result.recordedDeliveredCareHours, 1);
  assert.equal(result.deliveryVarianceHours, 0);
  assert.equal(result.deliveryRate, 100);
  assert.equal(result.qualifyingScheduledVisitCount, 1);
  assert.equal(result.qualifyingDeliveredVisitCount, 1);
});

test("a visit that ran long: delivered hours exceed scheduled, variance positive, rate > 100", () => {
  const result = calculateDeliveryHours([
    visit({ actualStart: "2026-09-01T14:00:00.000Z", actualEnd: "2026-09-01T16:00:00.000Z" }),
  ]);
  assert.equal(result.scheduledCareHours, 1);
  assert.equal(result.recordedDeliveredCareHours, 2);
  assert.equal(result.deliveryVarianceHours, 1);
  assert.equal(result.deliveryRate, 200);
});

// ─── Zero-denominator guardrail ──────────────────────────────────────────

test("zero Scheduled Care Hours -> deliveryRate is null (undefined), never 0", () => {
  const result = calculateDeliveryHours([]);
  assert.equal(result.scheduledCareHours, 0);
  assert.equal(result.deliveryRate, null);
});

// ─── Qualification: Scheduled Care Hours ─────────────────────────────────

test("a removed Visit does not contribute to Scheduled Care Hours", () => {
  const result = calculateDeliveryHours([visit({ status: "removed", removed: true })]);
  assert.equal(result.scheduledCareHours, 0);
  assert.equal(result.qualifyingScheduledVisitCount, 0);
});

test("an 'unknown' (contradictory) Visit does not contribute to Scheduled Care Hours", () => {
  const result = calculateDeliveryHours([visit({ status: "unknown" })]);
  assert.equal(result.scheduledCareHours, 0);
});

test("an 'unassigned' Visit still counts as real scheduled demand", () => {
  const result = calculateDeliveryHours([
    visit({ status: "unassigned", caregiverWorkforceMemberId: null, actualStart: null, actualEnd: null }),
  ]);
  assert.equal(result.scheduledCareHours, 1);
  assert.equal(result.qualifyingScheduledVisitCount, 1);
});

test("missing scheduledStart/scheduledEnd excludes the Visit from Scheduled Care Hours even if otherwise qualifying", () => {
  const result = calculateDeliveryHours([visit({ scheduledStart: null, scheduledEnd: null })]);
  assert.equal(result.scheduledCareHours, 0);
});

// ─── Qualification: Recorded Delivered Care Hours ────────────────────────

test("partial clock data (clock-in only, no clock-out) does not contribute to Recorded Delivered Care Hours", () => {
  const result = calculateDeliveryHours([visit({ actualEnd: null, status: "in_progress" })]);
  assert.equal(result.recordedDeliveredCareHours, 0);
  assert.equal(result.qualifyingDeliveredVisitCount, 0);
  // Scheduled Care Hours is a DIFFERENT qualifying subset — an in-progress
  // Visit still has usable scheduled times, so it still counts there.
  assert.equal(result.scheduledCareHours, 1);
});

test("a removed Visit never contributes to Recorded Delivered Care Hours, even with clock data present", () => {
  const result = calculateDeliveryHours([visit({ status: "removed", removed: true })]);
  assert.equal(result.recordedDeliveredCareHours, 0);
});

test("clock-out before clock-in (invalid data) is excluded rather than producing a negative duration", () => {
  const result = calculateDeliveryHours([
    visit({ actualStart: "2026-09-01T15:00:00.000Z", actualEnd: "2026-09-01T14:00:00.000Z" }),
  ]);
  assert.equal(result.recordedDeliveredCareHours, 0);
  assert.equal(result.qualifyingDeliveredVisitCount, 0);
});

// ─── Rollup / aggregation ─────────────────────────────────────────────────

test("rollup aggregates correctly by Community, Client (resident), and Caregiver", () => {
  const visits: VisitFactForMetrics[] = [
    visit({ residentId: "r1", communityId: "c1", caregiverWorkforceMemberId: "cg1" }),
    visit({ residentId: "r2", communityId: "c1", caregiverWorkforceMemberId: "cg2" }),
    visit({ residentId: "r3", communityId: "c2", caregiverWorkforceMemberId: "cg1" }),
  ];
  const rollup = calculateDeliveryHoursRollup(visits);

  assert.equal(rollup.enterprise.scheduledCareHours, 3);
  assert.equal(rollup.byCommunity.get("c1")!.scheduledCareHours, 2);
  assert.equal(rollup.byCommunity.get("c2")!.scheduledCareHours, 1);
  assert.equal(rollup.byResident.get("r1")!.scheduledCareHours, 1);
  assert.equal(rollup.byCaregiver.get("cg1")!.scheduledCareHours, 2);
  assert.equal(rollup.byCaregiver.get("cg2")!.scheduledCareHours, 1);
});

test("rollup preserves a null (non-Community) group rather than dropping or merging it", () => {
  const rollup = calculateDeliveryHoursRollup([visit({ communityId: null })]);
  assert.equal(rollup.byCommunity.has(null), true);
  assert.equal(rollup.byCommunity.get(null)!.scheduledCareHours, 1);
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
