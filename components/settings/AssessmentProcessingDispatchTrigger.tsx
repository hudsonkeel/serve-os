"use client";

import { useState, useTransition } from "react";
import { triggerAssessmentProcessingDispatch } from "@/lib/actions/assessmentProcessingAdmin";

// Diagnostic/admin-only — not part of the normal assessor workflow, deliberately not placed on
// any resident's assessment page. Exists because Netlify Scheduled Functions don't execute
// automatically on branch/preview deploys (only production), so this is the repeatable way to
// exercise the real dispatcher -> background-worker -> claim path before this feature is live.
// Calls the exact same dispatch logic the real scheduled function calls — this button performs
// no extraction itself.
export function AssessmentProcessingDispatchTrigger() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRun() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await triggerAssessmentProcessingDispatch();
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      const considered = outcome.considered ?? 0;
      const dispatched = outcome.dispatched ?? 0;
      const failedToDispatch = outcome.failedToDispatch ?? 0;
      setResult(
        considered === 0
          ? "No eligible sessions were found."
          : // "Submitted" only means Netlify returned a 2xx acknowledgment for the background-
            // function invocation -- it does NOT prove the worker started or claimed the session.
            // See each session's processing diagnostic stage below for what actually happened.
            `${considered} session(s) submitted to background processing (${dispatched} accepted${
              failedToDispatch > 0 ? `, ${failedToDispatch} failed to submit` : ""
            }).`
      );
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleRun}
        disabled={isPending}
        className="inline-flex h-10 items-center rounded-lg border border-ivory-border bg-ivory px-5 font-sans text-sm font-semibold text-body transition-colors hover:bg-white disabled:opacity-50"
      >
        {isPending ? "Running…" : "Run Processing Dispatcher Now"}
      </button>
      {result && <p className="mt-2 font-sans text-sm text-body">{result}</p>}
      {error && <p className="mt-2 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}
