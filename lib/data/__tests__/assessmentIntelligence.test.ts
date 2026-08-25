import assert from "node:assert/strict";
import { decideCaptureSessionResume, type AssessmentSessionRecord } from "../assessmentIntelligence.ts";

// Regression coverage for the 2026-08-25 native-capture resume defect: an admin-created
// synthetic session (is_synthetic_test=true, status='recording') got silently orphaned when a
// resume-lookup failure was treated identically to "no in-progress session exists," causing a
// second, non-synthetic session to be created for the same resident instead of resuming the
// first. decideCaptureSessionResume() is the pure decision point the fix lives in — see its own
// comment in lib/data/assessmentIntelligence.ts. Deliberately DB-free: this tests the decision
// logic directly, the same "pure logic, no I/O" split already established by
// communityResolution.ts, rather than requiring a live database to exercise the real bug.

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function syntheticSession(overrides: Partial<AssessmentSessionRecord> = {}): AssessmentSessionRecord {
  return {
    id: "6ed919e4-245e-4cbb-8809-ceaec5401da2",
    resident_id: "d0f37300-2a0b-42ba-92ab-eded231bb0c4",
    status: "recording",
    initiated_from: "new_provisional",
    started_by: "test",
    started_at: new Date().toISOString(),
    finished_at: null,
    community_id: null,
    is_synthetic_test: true,
    ...overrides,
  };
}

test("REGRESSION: create synthetic recording session -> enter native capture for the same resident -> the SAME session id is resumed, is_synthetic_test intact", () => {
  const session = syntheticSession();
  const decision = decideCaptureSessionResume({ session });
  assert.equal(decision.kind, "resume");
  if (decision.kind === "resume") {
    assert.equal(decision.session.id, session.id);
    assert.equal(decision.session.is_synthetic_test, true);
  }
});

test("no in-progress session and no lookup error: decides to create a new one — the genuinely correct case for a first-time capture", () => {
  const decision = decideCaptureSessionResume({ session: null });
  assert.equal(decision.kind, "create");
});

test("THE ACTUAL BUG: a lookup ERROR must never be treated the same as 'no session exists' — it must never decide 'create'", () => {
  const decision = decideCaptureSessionResume({ session: null, error: "Could not check for an in-progress assessment session — please try again." });
  assert.equal(decision.kind, "error");
  assert.notEqual(decision.kind, "create");
});

test("a lookup error takes priority even if a session were somehow also present — refusing outright is always safer than guessing", () => {
  const decision = decideCaptureSessionResume({ session: syntheticSession(), error: "transient failure" });
  assert.equal(decision.kind, "error");
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
