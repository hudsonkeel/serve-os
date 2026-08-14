"use client";

import { useState, useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { startAssessmentCapture } from "@/lib/actions/assessmentCapture";

interface AssessmentCaptureButtonProps {
  residentId: string;
  /** Overrides the button's own classes (e.g. equal-width sibling next to
   * QuickNoteButton in the person header). */
  className?: string;
}

// Calls the exact same server action AssessmentSection.tsx's original
// "Capture Assessment" button called — no new assessment business logic,
// just a second, more reachable trigger for it. Moved to the person header
// (always visible, no scrolling required) per real-device feedback;
// AssessmentSection's own launch button was removed as a duplicate once
// this existed (its Assessment History list and admin/test "Paste
// Transcript" fallback are unchanged and still live there).
export function AssessmentCaptureButton({ residentId, className }: AssessmentCaptureButtonProps) {
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
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={
          className ??
          "flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-navy px-4 font-sans text-button font-medium text-white shadow-card transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <ClipboardList size={17} strokeWidth={1.75} />
        {isPending ? "Starting…" : "Assessment"}
      </button>
      {error && <p className="font-sans text-xs text-danger-text">{error}</p>}
    </div>
  );
}
