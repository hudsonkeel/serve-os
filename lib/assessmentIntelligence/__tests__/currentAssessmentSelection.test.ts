import assert from "node:assert/strict";
import {
  isReviewReadyStatus,
  selectCurrentAssessmentState,
  type PendingAssessmentSummary,
  type ApprovedAssessmentSummary,
} from "../currentAssessmentSelection.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function pending(overrides: Partial<PendingAssessmentSummary> = {}): PendingAssessmentSummary {
  return {
    assessmentSessionId: "session-1",
    assessmentDate: "2026-09-10T18:00:00.000Z",
    factsCapturedCount: 12,
    openConflictsCount: 0,
    coverageQuestionsCount: 0,
    ...overrides,
  };
}

function approved(overrides: Partial<ApprovedAssessmentSummary> = {}): ApprovedAssessmentSummary {
  return {
    assessmentSessionId: "session-1",
    approvedAt: "2026-09-17T15:30:00.000Z",
    approvedBy: "hudson@serve.com",
    pdfDocumentId: null,
    ...overrides,
  };
}

test("isReviewReadyStatus: true for 'draft' and 'needs_review', false for every other session status", () => {
  assert.equal(isReviewReadyStatus("draft"), true);
  assert.equal(isReviewReadyStatus("needs_review"), true);
  for (const status of ["recording", "queued", "processing", "failed", "approved", "amended", "operationalized"]) {
    assert.equal(isReviewReadyStatus(status), false, status);
  }
});

test("NONE: no approved assessment and no pending sessions -- nothing to show", () => {
  const state = selectCurrentAssessmentState({ approved: null, pendingSessions: [] });
  assert.deepEqual(state, { kind: "none" });
});

test("PENDING-REVIEW: exactly one pending session -- links straight to it, no ambiguity", () => {
  const session = pending({ assessmentSessionId: "session-a" });
  const state = selectCurrentAssessmentState({ approved: null, pendingSessions: [session] });
  assert.equal(state.kind, "needs_review");
  assert.equal(state.kind === "needs_review" && state.session.assessmentSessionId, "session-a");
});

test("AMBIGUITY: multiple pending sessions are never silently collapsed to one -- surfaced as multiple_needs_review carrying every one of them", () => {
  const sessionA = pending({ assessmentSessionId: "session-a" });
  const sessionB = pending({ assessmentSessionId: "session-b" });
  const state = selectCurrentAssessmentState({ approved: null, pendingSessions: [sessionA, sessionB] });
  assert.equal(state.kind, "multiple_needs_review");
  assert.deepEqual(
    state.kind === "multiple_needs_review" && state.sessions.map((s) => s.assessmentSessionId),
    ["session-a", "session-b"]
  );
});

test("APPROVED: an approved assessment is the headline state and carries through approvedAt/approvedBy/pdfDocumentId exactly", () => {
  const state = selectCurrentAssessmentState({
    approved: approved({ assessmentSessionId: "session-x", approvedAt: "2026-09-17T15:30:00.000Z", approvedBy: "hudson@serve.com" }),
    pendingSessions: [],
  });
  assert.deepEqual(state, {
    kind: "approved",
    assessmentSessionId: "session-x",
    approvedAt: "2026-09-17T15:30:00.000Z",
    approvedBy: "hudson@serve.com",
    pdfDocumentId: null,
  });
});

test("APPROVED TAKES PRIORITY: an approved assessment is shown even when a newer reassessment session is also pending review -- never silently demoted or shown as ambiguous", () => {
  const state = selectCurrentAssessmentState({
    approved: approved({ assessmentSessionId: "session-old" }),
    pendingSessions: [pending({ assessmentSessionId: "session-new-reassessment" })],
  });
  assert.equal(state.kind, "approved");
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
