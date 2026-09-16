import assert from "node:assert/strict";
import {
  MAX_PROCESSING_ATTEMPTS,
  STALE_PROCESSING_AFTER_MS,
  SAFE_PROCESSING_FAILURE_MESSAGE,
  isEligibleForDispatch,
  isStaleProcessing,
  hasExceededAttemptLimit,
  decideStaleRecovery,
  decideRetryEligibility,
  sanitizeFailureReason,
  runDispatchTrigger,
  isRecordableDiagnosticStage,
  PROCESSING_DIAGNOSTIC_STAGES,
  type QueueableSession,
  type DispatchTriggerOutcome,
} from "../processingQueue.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function session(overrides: Partial<QueueableSession> = {}): QueueableSession {
  return { status: "queued", processingAttemptCount: 0, processingClaimedAt: null, ...overrides };
}

// ─── isEligibleForDispatch ──────────────────────────────────────────────

test("isEligibleForDispatch: true only for status='queued'", () => {
  assert.equal(isEligibleForDispatch(session({ status: "queued" })), true);
  for (const status of ["recording", "processing", "draft", "needs_review", "approved", "failed"]) {
    assert.equal(isEligibleForDispatch(session({ status })), false, `${status} should not be dispatch-eligible`);
  }
});

// ─── isStaleProcessing ──────────────────────────────────────────────────

test("isStaleProcessing: false for a non-'processing' session regardless of timestamps", () => {
  assert.equal(isStaleProcessing(session({ status: "queued", processingClaimedAt: null }), Date.now()), false);
});

test("isStaleProcessing: NOT eligible for recovery when 'processing' with no claim timestamp — this row was never claimed by the new async worker at all (every pre-existing/legacy session has this), so it must be left alone rather than resurrected as if it were newly-queued work", () => {
  assert.equal(isStaleProcessing(session({ status: "processing", processingClaimedAt: null }), Date.now()), false);
});

test("isStaleProcessing: false while still within the stale window", () => {
  const now = Date.now();
  const claimedAt = new Date(now - 1000).toISOString(); // claimed 1s ago
  assert.equal(isStaleProcessing(session({ status: "processing", processingClaimedAt: claimedAt }), now, 10_000), false);
});

test("isStaleProcessing: true once past the stale window", () => {
  const now = Date.now();
  const claimedAt = new Date(now - 20_000).toISOString(); // claimed 20s ago
  assert.equal(isStaleProcessing(session({ status: "processing", processingClaimedAt: claimedAt }), now, 10_000), true);
});

test("isStaleProcessing: default stale window is STALE_PROCESSING_AFTER_MS", () => {
  const now = Date.now();
  const justUnder = new Date(now - (STALE_PROCESSING_AFTER_MS - 1000)).toISOString();
  const justOver = new Date(now - (STALE_PROCESSING_AFTER_MS + 1000)).toISOString();
  assert.equal(isStaleProcessing(session({ status: "processing", processingClaimedAt: justUnder }), now), false);
  assert.equal(isStaleProcessing(session({ status: "processing", processingClaimedAt: justOver }), now), true);
});

// ─── hasExceededAttemptLimit ────────────────────────────────────────────

test("hasExceededAttemptLimit: false below the cap, true at and above it", () => {
  assert.equal(hasExceededAttemptLimit(0), false);
  assert.equal(hasExceededAttemptLimit(MAX_PROCESSING_ATTEMPTS - 1), false);
  assert.equal(hasExceededAttemptLimit(MAX_PROCESSING_ATTEMPTS), true);
  assert.equal(hasExceededAttemptLimit(MAX_PROCESSING_ATTEMPTS + 5), true);
});

// ─── decideStaleRecovery — bounded automatic recovery ──────────────────

test("decideStaleRecovery: requeues a stale session under the attempt cap", () => {
  const decision = decideStaleRecovery(session({ status: "processing", processingAttemptCount: 1 }));
  assert.deepEqual(decision, { action: "requeue" });
});

test("decideStaleRecovery: fails outright once the attempt cap is reached — never retries indefinitely", () => {
  const decision = decideStaleRecovery(session({ status: "processing", processingAttemptCount: MAX_PROCESSING_ATTEMPTS }));
  assert.equal(decision.action, "fail");
  assert.match((decision as { reason: string }).reason, /attempt limit/i);
});

test("decideStaleRecovery: simulated repeated stale cycles eventually reach 'fail', never loop forever", () => {
  let attemptCount = 0;
  const seenActions: string[] = [];
  for (let tick = 0; tick < MAX_PROCESSING_ATTEMPTS + 2; tick++) {
    const decision = decideStaleRecovery(session({ status: "processing", processingAttemptCount: attemptCount }));
    seenActions.push(decision.action);
    if (decision.action === "fail") break;
    attemptCount++; // a real claim increments the count each time it's re-dispatched
  }
  assert.equal(seenActions[seenActions.length - 1], "fail");
  assert.ok(seenActions.length <= MAX_PROCESSING_ATTEMPTS + 1, "must reach 'fail' at or before the attempt cap, not loop past it");
});

// ─── decideRetryEligibility — manual retry, same bound, idempotent ─────

test("decideRetryEligibility: not allowed when the session isn't actually failed", () => {
  const decision = decideRetryEligibility(session({ status: "processing" }));
  assert.equal(decision.allowed, false);
});

test("decideRetryEligibility: allowed for a failed session under the attempt cap", () => {
  const decision = decideRetryEligibility(session({ status: "failed", processingAttemptCount: 1 }));
  assert.deepEqual(decision, { allowed: true });
});

test("decideRetryEligibility: refuses retry once the attempt cap is reached, even though status is 'failed'", () => {
  const decision = decideRetryEligibility(session({ status: "failed", processingAttemptCount: MAX_PROCESSING_ATTEMPTS }));
  assert.equal(decision.allowed, false);
  assert.match((decision as { reason: string }).reason, /maximum processing attempts/i);
});

test("double retry is idempotent: a second retry against the now-requeued session is correctly refused, not double-queued", () => {
  const failed = session({ status: "failed", processingAttemptCount: 1 });
  const first = decideRetryEligibility(failed);
  assert.equal(first.allowed, true);

  // Simulate the real requeue's effect (status: 'failed' -> 'queued') the way
  // requeueSessionForRetry()'s conditional UPDATE would, then evaluate a second,
  // concurrent/double-click retry against that updated state.
  const afterFirstRetry = session({ ...failed, status: "queued" });
  const second = decideRetryEligibility(afterFirstRetry);
  assert.equal(second.allowed, false, "a second retry must not be allowed once the session is no longer 'failed'");
});

// ─── Safe failure messaging ─────────────────────────────────────────────

test("SAFE_PROCESSING_FAILURE_MESSAGE never contains raw provider/internal error text", () => {
  assert.equal(
    SAFE_PROCESSING_FAILURE_MESSAGE,
    "Assessment processing failed. Your transcript was saved. Retry processing or contact an administrator."
  );
});

test("sanitizeFailureReason: extracts an Error's message", () => {
  assert.equal(sanitizeFailureReason(new Error("OpenAI request timed out")), "OpenAI request timed out");
});

test("sanitizeFailureReason: stringifies a non-Error throw", () => {
  assert.equal(sanitizeFailureReason("raw string failure"), "raw string failure");
});

test("sanitizeFailureReason: truncates a runaway message to a bounded length", () => {
  const huge = "x".repeat(5000);
  const result = sanitizeFailureReason(new Error(huge), 2000);
  assert.equal(result.length, 2000);
});

// ─── runDispatchTrigger — the admin-only manual dispatch trigger's pure core ───────────────

function countingDispatch(outcomes: readonly DispatchTriggerOutcome[]): {
  dispatch: () => Promise<readonly DispatchTriggerOutcome[]>;
  callCount: () => number;
} {
  let calls = 0;
  return {
    dispatch: async () => {
      calls++;
      return outcomes;
    },
    callCount: () => calls,
  };
}

test("runDispatchTrigger: unauthorized caller gets an error, and the dispatch function is never called", async () => {
  const { dispatch, callCount } = countingDispatch([{ dispatched: true }]);
  const result = await runDispatchTrigger(false, dispatch);
  assert.equal(typeof result.error, "string");
  assert.equal(result.considered, undefined);
  assert.equal(callCount(), 0, "an unauthorized caller must never reach the dispatch function at all");
});

test("runDispatchTrigger: authorized caller invokes the given dispatch function exactly once and reports its results", async () => {
  const { dispatch, callCount } = countingDispatch([{ dispatched: true }, { dispatched: true }, { dispatched: false }]);
  const result = await runDispatchTrigger(true, dispatch);
  assert.deepEqual(result, { considered: 3, dispatched: 2, failedToDispatch: 1 });
  assert.equal(callCount(), 1, "must call the real dispatch logic exactly once, never loop or retry internally");
});

test("runDispatchTrigger: no eligible sessions is safe and idempotent — zero counts, no error", async () => {
  const { dispatch } = countingDispatch([]);
  const result = await runDispatchTrigger(true, dispatch);
  // Checked before deepEqual below -- Node's assert.deepEqual has an `asserts actual is T`
  // TypeScript signature that narrows `result`'s type to the expected literal afterward,
  // which would make a later `result.error` a type error.
  assert.equal(result.error, undefined);
  assert.deepEqual(result, { considered: 0, dispatched: 0, failedToDispatch: 0 });
});

test("runDispatchTrigger: performs no extraction itself — the only work done is calling the injected dispatch function", async () => {
  // dispatchEligibleAssessmentProcessing() (the real function used in production) only ever
  // invokes the background worker over HTTP — it never calls an extraction provider directly.
  // This trigger's own code has no import of, or call path to, anything extraction-related; the
  // strongest thing a runtime test can prove is that its entire effect is exactly one call to
  // whatever dispatch function it's given, which is what the call-count assertions above do.
  const { dispatch, callCount } = countingDispatch([{ dispatched: true }]);
  await runDispatchTrigger(true, dispatch);
  assert.equal(callCount(), 1);
});

test("runDispatchTrigger: a thrown error from the dispatch function never leaks raw/internal text to the caller", async () => {
  const dispatch = async (): Promise<readonly DispatchTriggerOutcome[]> => {
    throw new Error("OpenAI request failed: invalid_api_key sk-live-abcdEXAMPLE1234");
  };
  const result = await runDispatchTrigger(true, dispatch);
  assert.equal(result.error, "Could not run the processing dispatcher. Check server logs for detail.");
  assert.doesNotMatch(result.error ?? "", /sk-live|invalid_api_key|OpenAI/);
});

// ─── Processing diagnostics — isRecordableDiagnosticStage ──────────────

test("isRecordableDiagnosticStage: true for every declared stage, in order", () => {
  for (const stage of PROCESSING_DIAGNOSTIC_STAGES) {
    assert.equal(isRecordableDiagnosticStage(stage), true, `${stage} should be recordable`);
  }
  assert.deepEqual(PROCESSING_DIAGNOSTIC_STAGES, [
    "dispatched",
    "invocation_accepted",
    "worker_received",
    "extraction_started",
  ]);
});

test("isRecordableDiagnosticStage: false for values the DB CHECK constraint would reject — including terminal states that are derived from existing columns, never written as a diagnostic stage", () => {
  for (const notAStage of ["", "queued", "processing", "failed", "claimed", "DISPATCHED", " dispatched"]) {
    assert.equal(isRecordableDiagnosticStage(notAStage), false, `"${notAStage}" must not be recordable`);
  }
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
