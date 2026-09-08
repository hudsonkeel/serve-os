// Pure-function tests for lib/scheduling/visitFacts.ts. Run with:
//   npm run test:scheduling
//
// All fixtures are entirely fictional — no real AxisCare data, no real
// names, no real IDs (matching normalize.test.ts's convention).
import assert from "node:assert/strict";
import { buildVisitHistoricalFact, VISIT_FACT_DOMAIN, VISIT_FACT_TYPE, type VisitFactResolution } from "../visitFacts.ts";
import type { AxisCareRawVisit } from "../../integrations/axiscare/types.ts";
import type { ServeScheduleVisit } from "../types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function rawVisit(overrides: Partial<AxisCareRawVisit> = {}): AxisCareRawVisit {
  return {
    id: "fict-visit-1",
    client: { id: "fict-client-1", firstName: "Fictional", lastName: "Resident" },
    caregiver: { id: "fict-caregiver-1", firstName: "Fictional", lastName: "Caregiver" },
    scheduledStartDate: "2026-09-01T09:00:00-05:00",
    scheduledEndDate: "2026-09-01T10:00:00-05:00",
    clockIn: { time: "2026-09-01T09:02:00-05:00" },
    clockOut: { time: "2026-09-01T10:05:00-05:00" },
    timezone: "America/Chicago",
    service: { id: "fict-svc-1", code: "H0001", description: "Fictional Service" },
    type: "standard",
    verified: true,
    removed: false,
    chargeRate: 42.5,
    billableRateMode: "hourly",
    ...overrides,
  };
}

function scheduleVisit(overrides: Partial<ServeScheduleVisit> = {}): ServeScheduleVisit {
  return {
    externalVisitId: "fict-visit-1",
    sourceSystem: "axiscare",
    resident: { externalId: "fict-client-1", displayName: "Fictional Resident" },
    caregiver: { externalId: "fict-caregiver-1", displayName: "Fictional Caregiver" },
    service: { externalId: "fict-svc-1", code: "H0001", description: "Fictional Service", procedureCode: null },
    scheduledStart: "2026-09-01T14:00:00.000Z",
    scheduledEnd: "2026-09-01T15:00:00.000Z",
    actualStart: "2026-09-01T14:02:00.000Z",
    actualEnd: "2026-09-01T15:05:00.000Z",
    timezone: "America/Chicago",
    visitType: "standard",
    status: "completed",
    assigned: true,
    verified: true,
    removed: false,
    modificationReason: null,
    careModel: "unknown",
    provenanceConfidence: "unknown",
    ...overrides,
  };
}

const RESOLVED: VisitFactResolution = {
  residentId: "fict-resident-uuid-1",
  communityId: "fict-community-uuid-1",
  caregiverWorkforceMemberId: "fict-caregiver-uuid-1",
};

// ─── Basic shape / determinism ──────────────────────────────────────────

test("resolved Visit produces a scheduling.visit_recorded Fact input", () => {
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.domain, VISIT_FACT_DOMAIN);
  assert.equal(result.input.factType, VISIT_FACT_TYPE);
  assert.equal(result.input.sourceSystem, "axiscare");
  assert.equal(result.input.sourceRecordId, "fict-visit-1");
});

test("output is deterministic for identical input", () => {
  const a = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  const b = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  assert.deepEqual(a, b);
});

// ─── Subject ─────────────────────────────────────────────────────────────

test("subject is the resolved resident, not the caregiver or a new Visit subject type", () => {
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.subject.subjectType, "resident");
  assert.equal(result.input.subject.subjectId, "fict-resident-uuid-1");
});

// ─── Community attribution ───────────────────────────────────────────────

test("resolved Community id is carried into the payload", () => {
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.payload.communityId, "fict-community-uuid-1");
});

test("a legitimately non-Community client is preserved as null, never forced into a Community", () => {
  const nonCommunity: VisitFactResolution = { ...RESOLVED, communityId: null };
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), nonCommunity);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.payload.communityId, null);
});

// ─── Caregiver attribution ────────────────────────────────────────────────

test("resolved caregiver workforce member id is carried into the payload", () => {
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.payload.caregiverWorkforceMemberId, "fict-caregiver-uuid-1");
});

test("unassigned Visit (no caregiver) has a null caregiver payload, not a skipped Fact", () => {
  const unassigned = scheduleVisit({ caregiver: null, assigned: false, status: "unassigned" });
  const unresolvedCaregiver: VisitFactResolution = { ...RESOLVED, caregiverWorkforceMemberId: null };
  const result = buildVisitHistoricalFact(rawVisit({ caregiver: undefined }), unassigned, unresolvedCaregiver);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.payload.caregiverWorkforceMemberId, null);
  assert.equal(result.input.payload.caregiverExternalId, null);
});

test("caregiver identity-linked externalId present but not yet resolved to a workforce member: Fact is still built, caregiverWorkforceMemberId null", () => {
  const notYetLinked: VisitFactResolution = { ...RESOLVED, caregiverWorkforceMemberId: null };
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), notYetLinked);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.payload.caregiverWorkforceMemberId, null);
  assert.equal(result.input.payload.caregiverExternalId, "fict-caregiver-1");
});

// ─── Occurrence time ─────────────────────────────────────────────────────

test("occurredAt prefers actualStart when present", () => {
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.occurredAt, "2026-09-01T14:02:00.000Z");
});

test("occurredAt falls back to scheduledStart when actualStart is absent", () => {
  const notYetDelivered = scheduleVisit({ actualStart: null, actualEnd: null, status: "scheduled" });
  const result = buildVisitHistoricalFact(rawVisit({ clockIn: undefined, clockOut: undefined }), notYetDelivered, RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.occurredAt, "2026-09-01T14:00:00.000Z");
});

test("no usable scheduledStart or actualStart -> skipped with no_usable_occurrence_time", () => {
  const noUsableTime = scheduleVisit({ actualStart: null, actualEnd: null, scheduledStart: "", scheduledEnd: "" });
  const result = buildVisitHistoricalFact(rawVisit(), noUsableTime, RESOLVED);
  assert.equal(result.skipped, true);
  if (!result.skipped) return;
  assert.equal(result.reason, "no_usable_occurrence_time");
  assert.equal(result.externalVisitId, "fict-visit-1");
});

// ─── Unresolved resident identity ────────────────────────────────────────

test("unresolved resident identity -> skipped, never a fabricated subject id", () => {
  const unresolved: VisitFactResolution = { ...RESOLVED, residentId: null };
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), unresolved);
  assert.equal(result.skipped, true);
  if (!result.skipped) return;
  assert.equal(result.reason, "unresolved_resident_identity");
});

// ─── Removed / status handling ───────────────────────────────────────────

test("a removed Visit still produces a Fact (never silently hidden), with status preserved in the payload", () => {
  const removed = scheduleVisit({ removed: true, status: "removed", actualStart: null, actualEnd: null });
  const result = buildVisitHistoricalFact(rawVisit({ removed: true, clockIn: undefined, clockOut: undefined }), removed, RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.payload.status, "removed");
  assert.equal(result.input.payload.removed, true);
});

// ─── Clock-in/out handling ────────────────────────────────────────────────

test("both clock-in and clock-out present are both carried into the payload", () => {
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.payload.actualStart, "2026-09-01T14:02:00.000Z");
  assert.equal(result.input.payload.actualEnd, "2026-09-01T15:05:00.000Z");
});

test("partial clock data (clock-in only) is preserved as-is, not fabricated into a full pair", () => {
  const partial = scheduleVisit({ actualEnd: null, status: "in_progress" });
  const result = buildVisitHistoricalFact(rawVisit({ clockOut: undefined }), partial, RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.input.payload.actualStart, "2026-09-01T14:02:00.000Z");
  assert.equal(result.input.payload.actualEnd, null);
});

// ─── Source economic attributes (Phase 3) ────────────────────────────────

test("chargeRate/billableRateMode are preserved as normalized source attributes, never labeled Revenue/Labor", () => {
  const result = buildVisitHistoricalFact(rawVisit(), scheduleVisit(), RESOLVED);
  assert.equal(result.skipped, false);
  if (result.skipped) return;
  const attrs = result.input.payload.sourceEconomicAttributes as Record<string, unknown>;
  assert.equal(attrs.chargeRate, 42.5);
  assert.equal(attrs.billableRateMode, "hourly");
  assert.ok(!("serviceRevenue" in result.input.payload));
  assert.ok(!("directCaregiverLabor" in result.input.payload));
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
