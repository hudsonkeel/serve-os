import assert from "node:assert/strict";
import { resolveSyncSummaryDisplay, type SyncSummaryForDisplay } from "../syncStatusDisplay.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function summary(overrides: Partial<SyncSummaryForDisplay>): SyncSummaryForDisplay {
  return {
    status: "success",
    recordsReceived: 0,
    reviewCandidatesCreated: 0,
    errors: [],
    ...overrides,
  };
}

// ── 1. Disabled flag ──────────────────────────────────────────────────────

test("DISABLED: renders clear disabled language, not generic error phrasing", () => {
  const display = resolveSyncSummaryDisplay(
    summary({ status: "disabled", errors: [{ vendorRecordId: null, message: "Workforce AxisCare sync is not enabled." }] })
  );
  assert.equal(display.tone, "neutral");
  assert.equal(display.message, "AxisCare workforce sync is disabled for this environment.");
  assert.ok(!display.message.includes("error"), "must not present as a generic error");
  assert.equal(display.detail, null, "disabled state needs no supporting error detail");
});

// ── 2. Successful sync ────────────────────────────────────────────────────

test("SUCCESS: shows received/new/error counts correctly", () => {
  const display = resolveSyncSummaryDisplay(summary({ status: "success", recordsReceived: 28, reviewCandidatesCreated: 3, errors: [] }));
  assert.equal(display.tone, "success");
  assert.equal(display.message, "Sync complete: 28 received, 3 new candidates for review, 0 errors.");
});

// ── 3. Failed sync ────────────────────────────────────────────────────────

test("FAILED: renders distinct failure language, with the underlying (already-safe) message as detail", () => {
  const display = resolveSyncSummaryDisplay(
    summary({ status: "failed", errors: [{ vendorRecordId: null, message: "AxisCare integration is not configured. Missing: AXISCARE_API_TOKEN." }] })
  );
  assert.equal(display.tone, "danger");
  assert.equal(display.message, "AxisCare workforce sync failed. View details or try again.");
  assert.equal(display.detail, "AxisCare integration is not configured. Missing: AXISCARE_API_TOKEN.");
});

test("FAILED: multiple errors summarize count in the detail line rather than dumping all of them", () => {
  const display = resolveSyncSummaryDisplay(
    summary({
      status: "failed",
      errors: [
        { vendorRecordId: "1", message: "first failure" },
        { vendorRecordId: "2", message: "second failure" },
        { vendorRecordId: "3", message: "third failure" },
      ],
    })
  );
  assert.equal(display.detail, "first failure (+2 more)");
});

// ── 4. Partial success ────────────────────────────────────────────────────

test("PARTIAL: renders distinct 'completed with issues' language", () => {
  const display = resolveSyncSummaryDisplay(
    summary({ status: "partial", recordsReceived: 28, reviewCandidatesCreated: 3, errors: [{ vendorRecordId: "99", message: "Caregiver record has no usable id field" }] })
  );
  assert.equal(display.tone, "warning");
  assert.equal(display.message, "Sync complete with issues: 28 received, 3 new candidates, 1 record failed.");
  assert.equal(display.detail, "Caregiver record has no usable id field");
});

test("PARTIAL: pluralizes 'records' correctly for >1 failure", () => {
  const display = resolveSyncSummaryDisplay(
    summary({
      status: "partial",
      recordsReceived: 28,
      errors: [
        { vendorRecordId: "1", message: "a" },
        { vendorRecordId: "2", message: "b" },
      ],
    })
  );
  assert.ok(display.message.includes("2 records failed"));
});

// Every distinct status must produce a distinct tone — the whole point of
// this module is that an admin can tell states apart at a glance.
test("all four states produce mutually distinct tones", () => {
  const tones = new Set(
    (["disabled", "success", "partial", "failed"] as const).map((status) => resolveSyncSummaryDisplay(summary({ status })).tone)
  );
  assert.equal(tones.size, 4);
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
