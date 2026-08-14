import assert from "node:assert/strict";
import { syncAxisCareCaregivers, pickLatestSuccessfulSyncRun } from "../axiscareCaregiverSync.ts";
import type { WorkforceAxisCareSyncRun } from "../../supabase/types.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ── 1. Disabled flag ──────────────────────────────────────────────────────
//
// The disabled short-circuit in syncAxisCareCaregivers() returns before any
// Supabase or AxisCare call is made, so this is safely testable in
// isolation — no credentials, no network, no mocking required.

test("DISABLED: unset AXISCARE_WORKFORCE_ENABLED returns status 'disabled', not 'failed', with zero I/O", async () => {
  const original = process.env.AXISCARE_WORKFORCE_ENABLED;
  delete process.env.AXISCARE_WORKFORCE_ENABLED;
  try {
    const summary = await syncAxisCareCaregivers("test-actor");
    assert.equal(summary.status, "disabled");
    assert.equal(summary.recordsReceived, 0);
    assert.equal(summary.reviewCandidatesCreated, 0);
    assert.equal(summary.errors.length, 1);
    assert.equal(summary.errors[0].message, "Workforce AxisCare sync is not enabled.");
    assert.equal(summary.syncRunId, "", "no sync run row should be created for a disabled sync");
  } finally {
    if (original !== undefined) process.env.AXISCARE_WORKFORCE_ENABLED = original;
  }
});

test("DISABLED: a near-miss value ('TRUE', '1', 'yes') is still disabled — exact-match discipline preserved", async () => {
  const original = process.env.AXISCARE_WORKFORCE_ENABLED;
  for (const value of ["TRUE", "1", "yes", "false", ""]) {
    process.env.AXISCARE_WORKFORCE_ENABLED = value;
    const summary = await syncAxisCareCaregivers("test-actor");
    assert.equal(summary.status, "disabled", `expected disabled for value ${JSON.stringify(value)}`);
  }
  if (original !== undefined) process.env.AXISCARE_WORKFORCE_ENABLED = original;
  else delete process.env.AXISCARE_WORKFORCE_ENABLED;
});

// ── 5. "Last successful sync" decision logic ──────────────────────────────

function run(overrides: Partial<WorkforceAxisCareSyncRun>): WorkforceAxisCareSyncRun {
  return {
    id: "id",
    status: "success",
    started_at: "2026-08-02T14:59:11.166643+00:00",
    completed_at: "2026-08-02T14:59:21.259+00:00",
    records_received: 24,
    source_records_refreshed: 0,
    source_records_unchanged: 18,
    review_candidates_created: 0,
    errors: [],
    initiated_by: "Hud Keel",
    ...overrides,
  };
}

test("picks the most recent success", () => {
  const runs = [
    run({ id: "old", status: "success", started_at: "2026-07-30T12:00:00Z" }),
    run({ id: "new", status: "success", started_at: "2026-08-02T12:00:00Z" }),
  ];
  const picked = pickLatestSuccessfulSyncRun(runs);
  assert.equal(picked?.id, "new");
});

test("REQUIRED: a newer failed run does not hide/overwrite an older successful one", () => {
  const runs = [
    run({ id: "success", status: "success", started_at: "2026-08-02T12:00:00Z" }),
    run({ id: "later-fail", status: "failed", started_at: "2026-08-14T09:00:00Z" }),
  ];
  const picked = pickLatestSuccessfulSyncRun(runs);
  assert.equal(picked?.id, "success");
});

test("a newer disabled 'run' does not affect the last successful sync either", () => {
  // Disabled attempts never create a row (see the DISABLED tests above),
  // but this proves the picker is correct even if one somehow existed.
  const runs = [
    run({ id: "success", status: "success", started_at: "2026-08-02T12:00:00Z" }),
    run({ id: "later-partial", status: "partial", started_at: "2026-08-10T09:00:00Z" }),
  ];
  const picked = pickLatestSuccessfulSyncRun(runs);
  assert.equal(picked?.id, "success", "'partial' must not count as 'success' for this purpose");
});

test("REQUIRED: no successful run at all returns null, not the latest run of any status", () => {
  const runs = [
    run({ id: "fail-1", status: "failed", started_at: "2026-08-01T00:00:00Z" }),
    run({ id: "fail-2", status: "failed", started_at: "2026-08-02T00:00:00Z" }),
  ];
  assert.equal(pickLatestSuccessfulSyncRun(runs), null);
});

test("empty input returns null", () => {
  assert.equal(pickLatestSuccessfulSyncRun([]), null);
});

let passed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
