// Pure decision logic for the asynchronous assessment-extraction queue (2026-09-16) --
// eligibility, staleness, and the bounded-retry policy. Kept entirely I/O-free so it's testable
// without Supabase, mirroring the pure/I-O split already established in this codebase
// (lib/relationships/enrollment.ts, lib/assessmentIntelligence/conflictDetection.ts,
// lib/assessmentIntelligence/coverage.ts). lib/data/assessmentIntelligence.ts and
// lib/assessmentIntelligence/pipeline.ts wrap these decisions with the real conditional-update
// database calls.

export const MAX_PROCESSING_ATTEMPTS = 3;

// How long a session may sit at status='processing' before it's treated as abandoned (the
// worker that claimed it crashed, or was killed by a platform timeout) rather than "a worker is
// still genuinely within its normal execution window." Netlify Background Functions run for up
// to 15 minutes; this is set comfortably below that so a merely-slow-but-still-running worker is
// never mistaken for a stuck one.
export const STALE_PROCESSING_AFTER_MS = 10 * 60 * 1000;

// The one message ever shown to an operator for a failed session -- never the raw
// provider/internal error text (that's failure_reason, administrator/debugging detail only,
// stored but never rendered directly in this UI).
export const SAFE_PROCESSING_FAILURE_MESSAGE =
  "Assessment processing failed. Your transcript was saved. Retry processing or contact an administrator.";

export interface QueueableSession {
  readonly status: string;
  readonly processingAttemptCount: number;
  readonly processingClaimedAt: string | null;
}

/** Is this session something the dispatcher should hand off to a background worker right now? */
export function isEligibleForDispatch(session: QueueableSession): boolean {
  return session.status === "queued";
}

/** Has a 'processing' session been claimed long enough ago to safely treat as abandoned? A
 * claimed-but-never-timestamped row (defensive -- the real claim path always sets this) is
 * conservatively treated as stale rather than stuck there forever with no recovery path. */
export function isStaleProcessing(
  session: QueueableSession,
  nowMs: number,
  staleAfterMs: number = STALE_PROCESSING_AFTER_MS
): boolean {
  if (session.status !== "processing") return false;
  if (!session.processingClaimedAt) return true;
  return nowMs - new Date(session.processingClaimedAt).getTime() >= staleAfterMs;
}

export function hasExceededAttemptLimit(
  attemptCount: number,
  maxAttempts: number = MAX_PROCESSING_ATTEMPTS
): boolean {
  return attemptCount >= maxAttempts;
}

export type StaleRecoveryDecision = { readonly action: "requeue" } | { readonly action: "fail"; readonly reason: string };

/** What should automatic recovery do with a stale 'processing' session? Bounded: a session that
 * has already used up its attempts is marked 'failed' outright, never requeued again -- this is
 * the one place that guarantees a session eventually reaches 'failed' rather than retrying
 * indefinitely. */
export function decideStaleRecovery(
  session: QueueableSession,
  maxAttempts: number = MAX_PROCESSING_ATTEMPTS
): StaleRecoveryDecision {
  if (hasExceededAttemptLimit(session.processingAttemptCount, maxAttempts)) {
    return {
      action: "fail",
      reason: `Processing attempt limit (${maxAttempts}) reached after repeated timeouts or crashes.`,
    };
  }
  return { action: "requeue" };
}

export type RetryDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/** Is a manual operator retry allowed right now, given the session's current state? The same
 * cap that bounds automatic recovery also bounds manual retry -- retry is not an escape hatch
 * around the attempt limit. Checking session.status here (not just the attempt count) is what
 * makes a second, concurrent retry click idempotent: once the first click's requeue has taken
 * effect, a second decideRetryEligibility() call against the now-'queued' (or already
 * re-claimed 'processing') session correctly reports not-allowed, "not failed," rather than
 * requeuing a second time. */
export function decideRetryEligibility(
  session: QueueableSession,
  maxAttempts: number = MAX_PROCESSING_ATTEMPTS
): RetryDecision {
  if (session.status !== "failed") {
    return { allowed: false, reason: "This assessment is not in a failed state." };
  }
  if (hasExceededAttemptLimit(session.processingAttemptCount, maxAttempts)) {
    return {
      allowed: false,
      reason: `Maximum processing attempts (${maxAttempts}) already reached — contact an administrator.`,
    };
  }
  return { allowed: true };
}

/** Sanitizes a raw error for durable storage in failure_reason -- administrator/debugging detail
 * only, never rendered directly in the operator UI (see SAFE_PROCESSING_FAILURE_MESSAGE).
 * Bounded length so a runaway stack trace or provider error blob never bloats the row. */
export function sanitizeFailureReason(err: unknown, maxLength = 2000): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, maxLength);
}
