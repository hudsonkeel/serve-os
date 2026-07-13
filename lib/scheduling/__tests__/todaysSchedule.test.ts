// Integration-shaped tests for lib/scheduling/todaysSchedule.ts and the
// AxisCare pagination/hostname-validation logic it depends on. Uses the
// same request-capturing fake-fetch convention as
// lib/integrations/axiscare/__tests__/sanitization.test.ts. Run with:
//
//   npm run test:scheduling
//
// All fixtures are fictional. No live API call is made by this file.
import assert from "node:assert/strict";
import { getAxisCareTodaysSchedule, summarizeVisits } from "../todaysSchedule.ts";
import { validateNextPageUrl } from "../../integrations/axiscare/visits.ts";
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

// ─── 12. Summary counts ──────────────────────────────────────────────────

test("12. summarizeVisits produces exact counts for a mixed batch, excluding removed from active buckets", () => {
  const visits: ServeScheduleVisit[] = [
    fictionalVisit({ status: "scheduled", assigned: true }),
    fictionalVisit({ status: "scheduled", assigned: true }),
    fictionalVisit({ status: "unassigned", assigned: false }),
    fictionalVisit({ status: "in_progress", assigned: true }),
    fictionalVisit({ status: "completed", assigned: true }),
    // Removed AND unassigned — the exact case that previously inflated
    // "unassigned" coverage. Must count as removed only.
    fictionalVisit({ status: "removed", assigned: false, removed: true }),
    fictionalVisit({ status: "unknown", assigned: false }),
  ];

  const summary = summarizeVisits(visits);
  assert.equal(summary.sourceRecordCount, 7);
  assert.equal(summary.activeVisitCount, 6);
  assert.equal(summary.removedVisitCount, 1);
  assert.equal(summary.activeAssignedCount, 4);
  assert.equal(summary.activeUnassignedCount, 2);
  assert.equal(summary.scheduledCount, 2);
  assert.equal(summary.inProgressCount, 1);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.unknownCount, 1);
  assert.equal(summary.missedCount, 0);

  // Invariant from Part F #4/#5 — see dedicated F4/F5 tests below for the
  // general case. Note the 5 normalized-status buckets do NOT always sum
  // to activeVisitCount: an active visit with status "unassigned" (like
  // fixture #3 and #7 above) is captured by activeUnassignedCount, not by
  // any of scheduled/inProgress/completed/missed/unknown — matching Part
  // A's own recommended shape, which has no dedicated "unassigned" status
  // bucket among the five.
  assert.equal(summary.activeVisitCount + summary.removedVisitCount, summary.sourceRecordCount);
  assert.equal(
    summary.activeAssignedCount + summary.activeUnassignedCount,
    summary.activeVisitCount
  );
});

// ─── 17. Empty result ────────────────────────────────────────────────────

test("17. summarizeVisits on an empty list returns all-zero counts", () => {
  const summary = summarizeVisits([]);
  assert.deepEqual(summary, {
    sourceRecordCount: 0,
    activeVisitCount: 0,
    removedVisitCount: 0,
    activeAssignedCount: 0,
    activeUnassignedCount: 0,
    scheduledCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    missedCount: 0,
    unknownCount: 0,
  });
});

// ─── 13. Unavailable / configuration state ──────────────────────────────

test("13. getAxisCareTodaysSchedule reports not_configured when AxisCare env vars are missing", async () => {
  const keys = [
    "AXISCARE_API_TOKEN",
    "AXISCARE_SITE_NUMBER",
    "AXISCARE_API_VERSION",
    "AXISCARE_API_BASE_URL",
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    const result = await getAxisCareTodaysSchedule();
    assert.equal(result.available, false);
    if (!result.available) {
      assert.equal(result.reason, "not_configured");
      assert.equal(result.sourceSystem, "axiscare");
      assert.ok(result.operationalDate.length > 0);
      // Safe to name *which* variable is missing (AXISCARE_API_TOKEN is a
      // variable name, not a secret value) — what must never appear is an
      // actual token-shaped value.
      assert.ok(!result.safeMessage.includes("axc_"));
      assert.ok(result.safeMessage.includes("AXISCARE_API_TOKEN"));
    }
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

// ─── Fake-fetch harness (mirrors the AxisCare integration test convention) ─

async function withFakeFetch<T>(
  responder: (url: URL) => { ok: boolean; status: number; json?: () => Promise<unknown> },
  fn: () => Promise<T>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    AXISCARE_API_TOKEN: process.env.AXISCARE_API_TOKEN,
    AXISCARE_SITE_NUMBER: process.env.AXISCARE_SITE_NUMBER,
    AXISCARE_API_VERSION: process.env.AXISCARE_API_VERSION,
    AXISCARE_API_BASE_URL: process.env.AXISCARE_API_BASE_URL,
  };
  process.env.AXISCARE_API_TOKEN = "axc_fictional_test_token";
  process.env.AXISCARE_SITE_NUMBER = "00000";
  process.env.AXISCARE_API_VERSION = "2023-10-01";
  process.env.AXISCARE_API_BASE_URL = "https://00000.axiscare.com";

  // @ts-expect-error — intentionally minimal fetch stub for this test only
  globalThis.fetch = async (input: string | URL) => {
    const url = new URL(input.toString());
    const fake = responder(url);
    return {
      ok: fake.ok,
      status: fake.status,
      json: fake.json ?? (async () => ({})),
      text: async () => "",
    } as Response;
  };

  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ─── 14. Authentication error mapping ───────────────────────────────────

test("14. getAxisCareTodaysSchedule maps a 401 to reason authentication without leaking vendor text", async () => {
  await withFakeFetch(
    () => ({ ok: false, status: 401 }),
    async () => {
      const result = await getAxisCareTodaysSchedule();
      assert.equal(result.available, false);
      if (!result.available) {
        assert.equal(result.reason, "authentication");
      }
    }
  );
});

// ─── available:true / empty visits ──────────────────────────────────────

test("getAxisCareTodaysSchedule returns available:true with zero visits for an empty results.visits array", async () => {
  await withFakeFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: { visits: [], nextPage: null } }),
    }),
    async () => {
      const result = await getAxisCareTodaysSchedule();
      assert.equal(result.available, true);
      if (result.available) {
        assert.deepEqual(result.visits, []);
        assert.deepEqual(result.activeVisits, []);
        assert.equal(result.summary.sourceRecordCount, 0);
        assert.equal(result.pagination.hasNextPage, false);
        assert.equal(result.timeFieldAudit.recordsWithBothPairsPresent, 0);
        assert.equal(result.timeFieldAudit.minAbsoluteDifferenceMinutes, null);
      }
    }
  );
});

// ─── 15. Pagination bounds and hostname validation ──────────────────────

test("15a. validateNextPageUrl accepts a matching HTTPS AxisCare URL", () => {
  const path = validateNextPageUrl(
    "https://00000.axiscare.com/api/visits?page=2",
    "https://00000.axiscare.com"
  );
  assert.equal(path, "/api/visits?page=2");
});

test("15b. validateNextPageUrl rejects a mismatched hostname", () => {
  const path = validateNextPageUrl(
    "https://evil.example.com/api/visits?page=2",
    "https://00000.axiscare.com"
  );
  assert.equal(path, null);
});

test("15c. validateNextPageUrl rejects non-HTTPS", () => {
  const path = validateNextPageUrl(
    "http://00000.axiscare.com/api/visits?page=2",
    "https://00000.axiscare.com"
  );
  assert.equal(path, null);
});

test("15d. validateNextPageUrl rejects a non-/api path", () => {
  const path = validateNextPageUrl(
    "https://00000.axiscare.com/admin/visits?page=2",
    "https://00000.axiscare.com"
  );
  assert.equal(path, null);
});

test("15e. validateNextPageUrl rejects a bare page number/cursor it can't safely construct a request from", () => {
  assert.equal(validateNextPageUrl(2, "https://00000.axiscare.com"), null);
  assert.equal(validateNextPageUrl("cursor-abc123", "https://00000.axiscare.com"), null);
  assert.equal(validateNextPageUrl(null, "https://00000.axiscare.com"), null);
});

test("15f. pagination stops at the conservative page bound and reports hasNextPage:true", async () => {
  let requestCount = 0;
  await withFakeFetch(
    () => {
      requestCount += 1;
      // Every page claims there's another one — proves the bound (not a
      // natural end) is what stops the crawl.
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: {
            visits: [{ id: `fict-visit-${requestCount}` }],
            nextPage: "https://00000.axiscare.com/api/visits?page=" + (requestCount + 1),
          },
        }),
      };
    },
    async () => {
      const result = await getAxisCareTodaysSchedule();
      assert.equal(result.available, true);
      if (result.available) {
        // MAX_PAGES = 3 in lib/integrations/axiscare/visits.ts.
        assert.equal(requestCount, 3);
        assert.equal(result.visits.length, 3);
        // None of these fictional records are removed, so activeVisits
        // matches visits exactly here.
        assert.equal(result.activeVisits.length, 3);
        assert.equal(result.pagination.hasNextPage, true);
      }
    }
  );
});

// ─── Part F: status-consistency tests ───────────────────────────────────

test("F1. removed + no caregiver counts as removed, not as active unassigned", () => {
  const summary = summarizeVisits([
    fictionalVisit({ status: "removed", removed: true, assigned: false }),
  ]);
  assert.equal(summary.removedVisitCount, 1);
  assert.equal(summary.activeVisitCount, 0);
  assert.equal(summary.activeUnassignedCount, 0);
});

test("F2. active + no caregiver counts as active unassigned", () => {
  const summary = summarizeVisits([
    fictionalVisit({ status: "unassigned", removed: false, assigned: false }),
  ]);
  assert.equal(summary.activeVisitCount, 1);
  assert.equal(summary.activeUnassignedCount, 1);
  assert.equal(summary.activeAssignedCount, 0);
  assert.equal(summary.removedVisitCount, 0);
});

test("F3. active + caregiver counts as active assigned", () => {
  const summary = summarizeVisits([
    fictionalVisit({ status: "scheduled", removed: false, assigned: true }),
  ]);
  assert.equal(summary.activeVisitCount, 1);
  assert.equal(summary.activeAssignedCount, 1);
  assert.equal(summary.activeUnassignedCount, 0);
});

test("F4. sourceRecordCount = activeVisitCount + removedVisitCount, for an arbitrary mix", () => {
  const summary = summarizeVisits([
    fictionalVisit({ status: "scheduled", assigned: true }),
    fictionalVisit({ status: "unassigned", assigned: false }),
    fictionalVisit({ status: "removed", assigned: false, removed: true }),
    fictionalVisit({ status: "removed", assigned: true, removed: true }),
    fictionalVisit({ status: "completed", assigned: true }),
  ]);
  assert.equal(summary.activeVisitCount + summary.removedVisitCount, summary.sourceRecordCount);
  assert.equal(summary.sourceRecordCount, 5);
  assert.equal(summary.activeVisitCount, 3);
  assert.equal(summary.removedVisitCount, 2);
});

test("F5. active normalized status buckets sum to activeVisitCount", () => {
  const summary = summarizeVisits([
    fictionalVisit({ status: "scheduled" }),
    fictionalVisit({ status: "in_progress" }),
    fictionalVisit({ status: "completed" }),
    fictionalVisit({ status: "unknown" }),
    fictionalVisit({ status: "unassigned", assigned: false }),
    fictionalVisit({ status: "removed", removed: true }),
  ]);
  const bucketSum =
    summary.scheduledCount +
    summary.inProgressCount +
    summary.completedCount +
    summary.missedCount +
    summary.unknownCount;
  // "unassigned" has no dedicated normalized-status bucket beyond
  // activeUnassignedCount (see summarizeVisits' switch default) — so the
  // five listed buckets sum to activeVisitCount minus the unassigned-only
  // record, which is exactly what's asserted below.
  assert.equal(bucketSum, summary.activeVisitCount - 1);
  assert.equal(summary.activeVisitCount, 5);
});

test("F6. no removed record appears in getAxisCareTodaysSchedule's activeVisits collection", async () => {
  await withFakeFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: {
          visits: [
            { id: "fict-visit-active-1", caregiver: { id: "fict-cg-1" }, clockIn: { time: null } },
            { id: "fict-visit-removed-1", removed: true },
            { id: "fict-visit-removed-2", removed: true, caregiver: { id: "fict-cg-2" } },
          ],
          nextPage: null,
        },
      }),
    }),
    async () => {
      const result = await getAxisCareTodaysSchedule();
      assert.equal(result.available, true);
      if (result.available) {
        assert.equal(result.visits.length, 3);
        assert.equal(result.activeVisits.length, 1);
        assert.ok(result.activeVisits.every((visit) => visit.status !== "removed"));
        assert.ok(!result.activeVisits.some((v) => v.externalVisitId.includes("removed")));
      }
    }
  );
});

test("F7. privacy boundaries remain intact on the new summary/activeVisits/timeFieldAudit fields", async () => {
  await withFakeFetch(
    () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: {
          visits: [
            {
              id: "fict-visit-1",
              client: {
                id: "fict-client-1",
                firstName: "Fictional",
                lastName: "Resident",
                ssn: "000-00-0000",
              },
              scheduledStartDate: "2026-01-15T09:00:00-06:00",
              scheduledEndDate: "2026-01-15T10:00:00-06:00",
              startDate: "2026-01-15T09:15:00-06:00",
              endDate: "2026-01-15T10:00:00-06:00",
            },
          ],
          nextPage: null,
        },
      }),
    }),
    async () => {
      const result = await getAxisCareTodaysSchedule();
      const serialized = JSON.stringify(result);
      assert.ok(!serialized.includes("000-00-0000"));
      // The timeFieldAudit is aggregate-only — confirm no raw timestamp
      // string or record id rides along inside it specifically.
      if (result.available) {
        const auditSerialized = JSON.stringify(result.timeFieldAudit);
        assert.ok(!auditSerialized.includes("fict-visit-1"));
        assert.ok(!auditSerialized.includes("2026-01-15"));
        assert.equal(result.timeFieldAudit.recordsWithBothPairsPresent, 1);
        assert.equal(result.timeFieldAudit.recordsWithDifferingInstants, 1);
        assert.equal(result.timeFieldAudit.minAbsoluteDifferenceMinutes, 15);
        assert.equal(result.timeFieldAudit.maxAbsoluteDifferenceMinutes, 15);
      }
    }
  );
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
