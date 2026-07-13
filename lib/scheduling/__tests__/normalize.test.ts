// Pure-function tests for lib/scheduling/normalize.ts. Run with:
//   npm run test:scheduling
//
// All fixtures are entirely fictional — no real AxisCare data, no real
// names, no real IDs.
import assert from "node:assert/strict";
import { normalizeAxisCareVisit, normalizeAxisCareSchedule } from "../normalize.ts";
import type { AxisCareRawVisit, AxisCareRawSchedule } from "../../integrations/axiscare/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── Display-name construction ──────────────────────────────────────────

test("8. resident/caregiver display names are built from firstName + lastName only", () => {
  const raw: AxisCareRawVisit = {
    id: "fict-visit-1",
    client: { id: "fict-client-1", firstName: "Fictional", lastName: "Resident" },
    caregiver: { id: "fict-caregiver-1", firstName: "Fictional", lastName: "Caregiver" },
    scheduledStartDate: "2026-01-15T09:00:00-06:00",
    scheduledEndDate: "2026-01-15T10:00:00-06:00",
  };
  const visit = normalizeAxisCareVisit(raw);
  assert.ok(visit);
  assert.equal(visit!.resident.displayName, "Fictional Resident");
  assert.equal(visit!.resident.externalId, "fict-client-1");
  assert.equal(visit!.caregiver?.displayName, "Fictional Caregiver");
  assert.equal(visit!.caregiver?.externalId, "fict-caregiver-1");
});

test("display name falls back to 'Unknown' when firstName/lastName are both absent", () => {
  const raw: AxisCareRawVisit = {
    id: "fict-visit-2",
    client: { id: "fict-client-2" },
    scheduledStartDate: "2026-01-15T09:00:00-06:00",
    scheduledEndDate: "2026-01-15T10:00:00-06:00",
  };
  const visit = normalizeAxisCareVisit(raw);
  assert.equal(visit?.resident.displayName, "Unknown");
});

test("null caregiver on the raw record means unassigned, not an empty display name", () => {
  const raw: AxisCareRawVisit = {
    id: "fict-visit-3",
    client: { id: "fict-client-3", firstName: "Fictional", lastName: "Resident" },
    scheduledStartDate: "2026-01-15T09:00:00-06:00",
    scheduledEndDate: "2026-01-15T10:00:00-06:00",
  };
  const visit = normalizeAxisCareVisit(raw);
  assert.equal(visit?.caregiver, null);
  assert.equal(visit?.assigned, false);
});

// ─── Privacy boundary ──────────────────────────────────────────────────

test("9. no sensitive fictional fields leak into ServeScheduleVisit", () => {
  // Simulates a raw record carrying sensitive fields far beyond what
  // AxisCareRawVisit's type enumerates (its index signature allows this,
  // matching how a real, loosely-typed vendor payload could look).
  const raw = {
    id: "fict-visit-4",
    client: {
      id: "fict-client-4",
      firstName: "Fictional",
      lastName: "Resident",
      ssn: "000-00-0000",
      dateOfBirth: "1900-01-01",
      address: "123 Fictional St",
      phone: "555-0100",
      email: "fictional@example.com",
    },
    scheduledStartDate: "2026-01-15T09:00:00-06:00",
    scheduledEndDate: "2026-01-15T10:00:00-06:00",
    chargeRate: 999,
    billableRateMode: "hourly",
    notes: "fictional sensitive note",
  } as unknown as AxisCareRawVisit;

  const visit = normalizeAxisCareVisit(raw);
  assert.ok(visit);

  const serialized = JSON.stringify(visit);
  assert.ok(!serialized.includes("000-00-0000"));
  assert.ok(!serialized.includes("1900-01-01"));
  assert.ok(!serialized.includes("123 Fictional St"));
  assert.ok(!serialized.includes("555-0100"));
  assert.ok(!serialized.includes("fictional@example.com"));
  assert.ok(!serialized.includes("fictional sensitive note"));
  assert.ok(!serialized.includes("999"));
  assert.ok(!serialized.includes("hourly"));

  // The only fields present on the normalized object are exactly
  // ServeScheduleVisit's declared keys — nothing extra rode along.
  assert.deepEqual(
    Object.keys(visit!).sort(),
    [
      "actualEnd",
      "actualStart",
      "assigned",
      "careModel",
      "caregiver",
      "externalVisitId",
      "modificationReason",
      "provenanceConfidence",
      "removed",
      "resident",
      "scheduledEnd",
      "scheduledStart",
      "service",
      "sourceSystem",
      "status",
      "timezone",
      "verified",
      "visitType",
    ].sort()
  );
});

test("malformed visit with no usable id returns null rather than a garbage record", () => {
  const raw = { client: { firstName: "Fictional" } } as AxisCareRawVisit;
  assert.equal(normalizeAxisCareVisit(raw), null);
});

// ─── Care model / provenance ────────────────────────────────────────────

test("careModel defaults to unknown with unknown provenance for any unmapped service code", () => {
  const raw: AxisCareRawVisit = {
    id: "fict-visit-5",
    client: { id: "fict-client-5", firstName: "Fictional", lastName: "Resident" },
    service: { id: "fict-svc-1", code: "H0000" },
    scheduledStartDate: "2026-01-15T09:00:00-06:00",
    scheduledEndDate: "2026-01-15T10:00:00-06:00",
  };
  const visit = normalizeAxisCareVisit(raw);
  assert.equal(visit?.careModel, "unknown");
  assert.equal(visit?.provenanceConfidence, "unknown");
  // The service code itself is still surfaced — only the *care model
  // inference* is withheld, not the underlying field.
  assert.equal(visit?.service?.code, "H0000");
});

// ─── Schedule (recurring plan) normalization ────────────────────────────

test("16. schedule normalization builds a ServeRecurringSchedule from a live-shaped fixture", () => {
  const raw: AxisCareRawSchedule = {
    scheduleId: "fict-sched-1",
    planId: "fict-plan-1",
    type: "Recurring",
    day: "Monday",
    client: { id: "fict-client-6", firstName: "Fictional", lastName: "Resident" },
    caregiver: { id: "fict-caregiver-6", firstName: "Fictional", lastName: "Caregiver" },
    startTime: "09:00:00",
    endTime: "10:00:00",
    timezone: "America/Chicago",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    frequency: "Weekly",
    service: { id: "fict-svc-2", code: "H0000", description: "Fictional Service" },
  };

  const schedule = normalizeAxisCareSchedule(raw);
  assert.ok(schedule);
  assert.equal(schedule!.externalScheduleId, "fict-sched-1");
  assert.equal(schedule!.externalPlanId, "fict-plan-1");
  assert.equal(schedule!.residentDisplayName, "Fictional Resident");
  assert.equal(schedule!.caregiverDisplayName, "Fictional Caregiver");
  assert.equal(schedule!.day, "Monday");
  assert.equal(schedule!.startTime, "09:00:00");
  assert.equal(schedule!.endTime, "10:00:00");
  assert.equal(schedule!.frequency, "Weekly");
  assert.equal(schedule!.serviceCode, "H0000");
  assert.equal(schedule!.careModel, "unknown");
});

test("malformed schedule with no scheduleId returns null", () => {
  const raw = { day: "Monday" } as AxisCareRawSchedule;
  assert.equal(normalizeAxisCareSchedule(raw), null);
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
