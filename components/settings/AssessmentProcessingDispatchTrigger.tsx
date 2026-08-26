"use client";

import { useState, useTransition } from "react";
import { LinkButton } from "@/components/ui/Button";
import {
  triggerAssessmentProcessingDispatch,
  createSyntheticAssessmentSessionAction,
  checkAwsIdentity,
  checkAssessmentDispatchHandoff,
} from "@/lib/actions/assessmentProcessingAdmin";

// Admin-only manual trigger UI for the assessment processing dispatcher — the Deploy Preview
// workaround for Netlify Scheduled Functions not running automatically on previews. See
// lib/actions/assessmentProcessingAdmin.ts for the authorization/PHI-gate discussion; this
// component is a thin, unstyled-of-consequence wrapper around that single action.

export function AssessmentProcessingDispatchTrigger() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ assessmentSessionId: string; error?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleTrigger() {
    setError(null);
    setMessage(null);
    setFailures([]);
    startTransition(async () => {
      const result = await triggerAssessmentProcessingDispatch();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(
        `Considered ${result.considered ?? 0} session(s) — dispatched ${result.dispatched ?? 0}` +
          (result.failed ? `, ${result.failed} failed to dispatch.` : ".")
      );
      // Previously computed and returned by the server action but never rendered here — a real
      // invokeStageWorker() failure (missing secret, unreachable URL, non-2xx response) was
      // silently dropped at this display layer even though the action itself never swallowed it.
      if (result.failures && result.failures.length > 0) {
        setFailures(result.failures);
      }
    });
  }

  return (
    <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <p className="font-sans text-sm font-medium text-body">Manual processing dispatch (admin)</p>
      <p className="mt-1 font-sans text-sm text-muted">
        Netlify Scheduled Functions do not run automatically on Deploy Previews. Use this to manually run one
        dispatch tick — the same code path the scheduled dispatcher uses in production — so a preview deployment
        can be exercised end to end. This never weakens the PHI processing gate; it only finds and dispatches
        already-eligible sessions.
      </p>
      <button
        type="button"
        onClick={handleTrigger}
        disabled={isPending}
        className="mt-3 inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Dispatching…" : "Run Dispatch Tick Now"}
      </button>
      {message && <p className="mt-3 font-sans text-sm text-success-text">{message}</p>}
      {failures.length > 0 && (
        <ul className="mt-2 space-y-1">
          {failures.map((f) => (
            <li key={f.assessmentSessionId} className="font-sans text-xs text-danger-text">
              {f.assessmentSessionId}: {f.error ?? "Unknown error."}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}

// Admin-only creation of the marked synthetic assessment session the acceptance test plan
// records against (docs/architecture/ASSESSMENT_TRANSCRIPTION_ORCHESTRATION.md). Always creates
// a fresh provisional resident — see lib/actions/assessmentProcessingAdmin.ts for why an
// arbitrary existing resident id is never accepted here. After creation, the capture screen link
// resumes directly into the just-created synthetic session (getOrStartNativeCaptureSession finds
// the in-progress session for that resident and attaches to it) — no separate step needed to
// "start" recording against it.
export function CreateSyntheticAssessmentSessionForm() {
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState("");
  const [result, setResult] = useState<{ residentId: string; assessmentSessionId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await createSyntheticAssessmentSessionAction(displayName);
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      if (outcome.residentId && outcome.assessmentSessionId) {
        setResult({ residentId: outcome.residentId, assessmentSessionId: outcome.assessmentSessionId });
        setDisplayName("");
      }
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <p className="font-sans text-sm font-medium text-body">Create synthetic test session (admin)</p>
      <p className="mt-1 font-sans text-sm text-muted">
        Creates a fresh test resident and a native capture session explicitly marked{" "}
        <span className="font-semibold">synthetic</span> — the only way a session becomes eligible for real AWS
        Transcribe/Bedrock calls without the production PHI gate (and only once this deployment also has
        PHI_SYNTHETIC_TEST_MODE enabled). Name it clearly — this never gets inferred from the name, but a clear name
        keeps it unmistakable everywhere it shows up.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="SYNTHETIC TEST — 2026-08-16"
          className="h-10 min-w-[280px] flex-1 rounded-lg border border-ivory-border bg-surface px-3 font-sans text-sm text-body"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending || !displayName.trim()}
          className="inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create Synthetic Session"}
        </button>
      </div>
      {result && (
        <div className="mt-3 flex items-center gap-3">
          <p className="font-sans text-sm text-success-text">Created.</p>
          <LinkButton href={`/residents/${result.residentId}/assessment/capture`} size="small">
            Open the capture screen →
          </LinkButton>
        </div>
      )}
      {error && <p className="mt-3 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}

// Admin-only AWS identity diagnostic — proves which AWS principal the deployed background
// worker is actually authenticating as, before trusting any real Transcribe/Bedrock call. Shows
// only the AWS account id and principal ARN, returned by lib/actions/assessmentProcessingAdmin
// .ts's checkAwsIdentity() action — never any credential material, never logged. Safe to leave
// visible indefinitely; nothing it displays is sensitive.
export function AwsIdentityCheck() {
  const [isPending, startTransition] = useTransition();
  const [identity, setIdentity] = useState<{ account?: string; arn?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCheck() {
    setError(null);
    setIdentity(null);
    startTransition(async () => {
      const result = await checkAwsIdentity();
      if (result.error) {
        setError(result.error);
        return;
      }
      setIdentity({ account: result.account, arn: result.arn });
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <p className="font-sans text-sm font-medium text-body">AWS identity check (admin)</p>
      <p className="mt-1 font-sans text-sm text-muted">
        Confirms which AWS account and IAM principal this deployment is actually authenticating as (via STS
        GetCallerIdentity) — should resolve to serve-netlify-assessment-pipeline, not any other identity. Discloses
        only the account id and ARN, never credentials.
      </p>
      <button
        type="button"
        onClick={handleCheck}
        disabled={isPending}
        className="mt-3 inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Checking…" : "Check AWS Identity"}
      </button>
      {identity && (
        <div className="mt-3 font-sans text-sm text-success-text">
          <p>Account: {identity.account}</p>
          <p>ARN: {identity.arn}</p>
        </div>
      )}
      {error && <p className="mt-3 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}

// Admin-only dispatcher -> background-worker handoff diagnostic (2026-08-26). Built because a
// Background Function's HTTP response cannot by itself prove its handler's own shared-secret
// check passed (see checkAssessmentDispatchHandoff()'s own comment) — this makes that otherwise
// invisible outcome visible without ever dispatching a real session or touching any session
// data. Reports only non-secret operational facts; the worker secret's value is never displayed.
export function AssessmentDispatchHandoffCheck() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkAssessmentDispatchHandoff>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCheck() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await checkAssessmentDispatchHandoff();
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      setResult(outcome);
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <p className="font-sans text-sm font-medium text-body">Dispatch handoff check (admin)</p>
      <p className="mt-1 font-sans text-sm text-muted">
        Pings the background stage worker with the same URL, route, and shared secret the real dispatcher uses —
        without ever calling into a real session&apos;s processing. A reachable HTTP response alone does not prove the
        secret check passed (Background Functions acknowledge before their handler necessarily finishes); the
        response body below does.
      </p>
      <button
        type="button"
        onClick={handleCheck}
        disabled={isPending}
        className="mt-3 inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Checking…" : "Check Dispatch Handoff"}
      </button>
      {result && (
        <div className="mt-3 space-y-1 font-sans text-sm text-body">
          <p>Base URL: {result.baseUrl ?? "(none resolved)"} <span className="text-muted">({result.baseUrlSource})</span></p>
          <p>Worker route: {result.workerRoute}</p>
          <p>Worker secret configured: {result.secretConfigured ? "yes" : "no"}</p>
          <p>Worker reached: {result.reached ? "yes" : "no"}</p>
          {result.httpStatus !== undefined && <p>HTTP status: {result.httpStatus}</p>}
          {result.responseBody && <p>Response body: {result.responseBody}</p>}
          {result.pingError && <p className="text-danger-text">Ping error: {result.pingError}</p>}
          <p className="mt-2">
            Currently eligible sessions: {result.eligibleSessionCount} of dispatch limit {result.dispatchLimit} —{" "}
            {result.allEligibleSessionsFitInOneBatch ? "all fit in one dispatch batch." : "MORE eligible sessions exist than one batch covers."}
          </p>
          {result.eligibleSessionIds && result.eligibleSessionIds.length > 0 && (
            <ul className="mt-1 space-y-0.5 font-sans text-xs text-muted">
              {result.eligibleSessionIds.map((id) => (
                <li key={id}>{id}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-3 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}
