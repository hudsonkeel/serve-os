"use client";

import { useState, useTransition } from "react";
import { startAssessmentCapture } from "@/lib/actions/assessmentCapture";

interface CaptureAssessmentButtonProps {
  residentId: string;
  residentName: string;
}

// "Capture Assessment" — launches the Serve Intake Engine's mobile/voice capture PWA for
// this existing canonical Serve person. Opens in a new tab so the assessor keeps Serve OS
// available; the Intake PWA never receives resident identity via the URL itself, only a
// single-use opaque handoff code (see lib/actions/assessmentCapture.ts).
export function CaptureAssessmentButton({
  residentId,
  residentName,
}: CaptureAssessmentButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startAssessmentCapture(residentId);
      if (result.error || !result.captureUrl) {
        setError(result.error || "Could not start assessment capture.");
        return;
      }
      window.open(result.captureUrl, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Assessment History
      </h3>
      <p className="mb-4 font-sans text-sm leading-relaxed text-body">
        Start a live or recorded assessment conversation with {residentName} using the Serve
        Intake Engine. Completed and scheduled assessments will appear here.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex h-10 items-center rounded-lg bg-navy px-5 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Starting…" : "Capture Assessment"}
      </button>
      {error && (
        <p className="mt-3 font-sans text-sm text-danger-text">{error}</p>
      )}
    </div>
  );
}
