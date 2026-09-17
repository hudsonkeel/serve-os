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

/** Has a 'processing' session been claimed long enough ago to safely treat as abandoned?
 * processing_claimed_at is written exclusively by claimSessionForProcessing() -- its presence
 * is the only reliable evidence a session was actually claimed by the new async worker at all.
 * A 'processing' row with no claim timestamp is NOT eligible for automatic recovery: it
 * predates this queue (every session created before the 20260916000000 migration has this
 * column NULL by construction, including long-abandoned legacy sessions from before this
 * architecture existed) and must never be swept up and silently resurrected as if it were new,
 * genuinely-queued work. (2026-09-16 incident: this previously returned true for a null
 * timestamp, which requeued a resident's months-old, pre-async-architecture stuck session
 * during the first live dispatch run on a branch deploy.) */
export function isStaleProcessing(
  session: QueueableSession,
  nowMs: number,
  staleAfterMs: number = STALE_PROCESSING_AFTER_MS
): boolean {
  if (session.status !== "processing") return false;
  if (!session.processingClaimedAt) return false;
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

// ─── Processing diagnostics (2026-09-16 observability slice) ──────────────────────────────────
// A compact, additive breadcrumb of the furthest stage the most recent dispatch/claim attempt
// reached (supabase/migrations/20260916010000_add_assessment_processing_diagnostics.sql,
// extended by 20260917000000_add_worker_wrapper_started_diagnostic_stage.sql) -- overwritten
// each attempt, not an append-only event log. Deliberately NOT a full 9-stage model: claim
// success, extraction success, and failure are already fully derivable from existing columns
// (status='processing' AND processing_claimed_at IS NOT NULL; status IN ('draft',
// 'needs_review'); status='failed' + failure_reason/failed_at), so only the otherwise-invisible
// stages get their own marker -- see recordProcessingDiagnosticStage() in
// lib/data/assessmentIntelligence.ts for where most of these are written.
//
// "worker_wrapper_started" and "worker_wrapper_fetch_failed" are the exceptions: written
// directly by netlify/functions/assessment-processing-stage-worker-background.mts via a raw
// PostgREST PATCH (not through recordProcessingDiagnosticStage(), which that file cannot import
// without reintroducing the server-only crash -- see that file's own header comment). Added
// 2026-09-17 after a live test showed all 11 dispatched sessions reaching 'worker_wrapper_started'
// and none reaching 'worker_received', with no way to tell whether the wrapper's own outbound
// fetch to the Next.js worker Route Handler ever completed, was rejected (a real HTTP response,
// just not a 2xx), or never got a response at all (thrown/timed out).
//
// 'worker_wrapper_fetch_failed' covers both "no response" and "non-2xx response" -- which of the
// two, and the exact status code for the latter, lives in the paired
// processing_diagnostic_wrapper_fetch_status column (WrapperFetchStatus below): NULL means no
// HTTP response was ever received; a value is the exact status code that came back. Kept as a
// separate bounded-integer column rather than more stage-enum values so a future status code
// never needs its own migration -- only ever a number, never a response body, exception message,
// URL, header, or provider error. "Route Handler accepted" needs no new stage at all, since
// 'worker_received' appearing already proves it.

export const PROCESSING_DIAGNOSTIC_STAGES = [
  "dispatched",
  "invocation_accepted",
  "worker_wrapper_started",
  "worker_wrapper_fetch_failed",
  "worker_received",
  "extraction_started",
] as const;

export type ProcessingDiagnosticStage = (typeof PROCESSING_DIAGNOSTIC_STAGES)[number];

/** Bounds for processing_diagnostic_wrapper_fetch_status (supabase/migrations/
 * 20260917010000_add_worker_wrapper_fetch_outcome_diagnostic_stages.sql) -- the exact HTTP
 * status code the worker wrapper's outbound fetch received, when it received one at all. Kept
 * here, pure and testable, for the same reason isRecordableDiagnosticStage() is: the DB CHECK
 * constraint is the real enforcement boundary, but a caller-side guard catches a bad value
 * before it ever reaches a write attempt. */
export function isPlausibleHttpStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 100 && status < 600;
}

/** Guards the one write path (recordProcessingDiagnosticStage) against ever persisting a stage
 * value outside the set the DB CHECK constraint allows -- kept here, pure and testable, rather
 * than only relying on TypeScript's compile-time narrowing, since the caller passes a value
 * computed at each call site, not a literal. */
export function isRecordableDiagnosticStage(stage: string): stage is ProcessingDiagnosticStage {
  return (PROCESSING_DIAGNOSTIC_STAGES as readonly string[]).includes(stage);
}

// ─── Admin-only manual dispatch trigger (lib/actions/assessmentProcessingAdmin.ts) ───────────
// Netlify Scheduled Functions are correctly registered on branch/preview deploys but do not
// execute automatically there (only on the production deploy) — this is what lets an
// authorized operator cause the real dispatcher to run right now instead, without any code
// path here ever touching the extraction provider or the database itself.

export interface DispatchTriggerOutcome {
  readonly dispatched: boolean;
}

export interface DispatchTriggerResult {
  readonly error?: string;
  readonly considered?: number;
  readonly dispatched?: number;
  readonly failedToDispatch?: number;
}

/** Pure decision core for the manual trigger — separated from the action file so it's testable
 * without a real Next.js request context (getCurrentAuthorizedUser() needs next/headers'
 * cookies(), which a plain test runner can't provide) or a live database, and so a
 * function-typed parameter never has to live in a "use server" file (Next.js requires every
 * export from one to be a directly client-callable action with serializable arguments).
 * Deliberately takes an already-resolved `isAuthorized` boolean, not a role — keeps this module
 * free of any dependency on AuthRole/lib/auth/permissions.ts; the action file owns that
 * decision and passes the result in. Never duplicates queue-discovery, worker-invocation, or
 * extraction logic itself — it only decides whether to call the dispatch function it's given
 * (in production, dispatchEligibleAssessmentProcessing() — the exact same function the real
 * scheduled dispatcher calls) and shapes a safe result, never leaking whatever it throws. */
export async function runDispatchTrigger(
  isAuthorized: boolean,
  dispatch: () => Promise<readonly DispatchTriggerOutcome[]>
): Promise<DispatchTriggerResult> {
  if (!isAuthorized) {
    return { error: "You do not have permission to trigger assessment processing." };
  }
  try {
    const results = await dispatch();
    const dispatchedCount = results.filter((r) => r.dispatched).length;
    return {
      considered: results.length,
      dispatched: dispatchedCount,
      failedToDispatch: results.length - dispatchedCount,
    };
  } catch {
    // Never surface a raw internal/provider error to the operator — same discipline as
    // SAFE_PROCESSING_FAILURE_MESSAGE above.
    return { error: "Could not run the processing dispatcher. Check server logs for detail." };
  }
}
