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
  type QueueableSession,
} from "../processingQueue.ts";

type Test = { name: string; fn: () => void };
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

test("isStaleProcessing: true when claimed but no timestamp was ever recorded (defensive)", () => {
  assert.equal(isStaleProcessing(session({ status: "processing", processingClaimedAt: null }), Date.now()), true);
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
