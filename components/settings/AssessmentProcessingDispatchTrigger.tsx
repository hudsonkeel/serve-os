"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  triggerAssessmentProcessingDispatch,
  createSyntheticAssessmentSessionAction,
  checkAwsIdentity,
} from "@/lib/actions/assessmentProcessingAdmin";

// Admin-only manual trigger UI for the assessment processing dispatcher — the Deploy Preview
// workaround for Netlify Scheduled Functions not running automatically on previews. See
// lib/actions/assessmentProcessingAdmin.ts for the authorization/PHI-gate discussion; this
// component is a thin, unstyled-of-consequence wrapper around that single action.

export function AssessmentProcessingDispatchTrigger() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleTrigger() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await triggerAssessmentProcessingDispatch();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(
        `Considered ${result.considered ?? 0} session(s) — dispatched ${result.dispatched ?? 0}` +
          (result.failed ? `, ${result.failed} failed to dispatch (see failures below).` : ".")
      );
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
        <p className="mt-3 font-sans text-sm text-success-text">
          Created. <Link href={`/residents/${result.residentId}/assessment/capture`} className="underline">Open the capture screen →</Link>
        </p>
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
