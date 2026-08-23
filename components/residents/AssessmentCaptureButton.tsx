"use client";

import { useState, useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { startAssessmentCapture } from "@/lib/actions/assessmentCapture";

interface AssessmentCaptureButtonProps {
  residentId: string;
  /** Overrides the button's own classes (e.g. equal-width sibling next to
   * QuickNoteButton in the person header). */
  className?: string;
  /** Resting-state label only ("Assessment" vs "Reassessment") — the
   * caller decides which, based on whether a qualifying completed
   * assessment already exists (see AssessmentSection.tsx's own
   * approved/operationalized status vocabulary). No new assessment-state
   * logic lives in this component; it only renders the word it's given. */
  label?: string;
}

// Calls the exact same server action AssessmentSection.tsx's original
// "Capture Assessment" button called — no new assessment business logic,
// just a second, more reachable trigger for it. Moved to the person header
// (always visible, no scrolling required) per real-device feedback;
// AssessmentSection's own launch button was removed as a duplicate once
// this existed (its Assessment History list and admin/test "Paste
// Transcript" fallback are unchanged and still live there).
export function AssessmentCaptureButton({ residentId, className, label = "Assessment" }: AssessmentCaptureButtonProps) {
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

  // display:contents on the wrapper — the button (and, rarely, the error
  // line) become direct flex items of whatever row this is placed in,
  // exactly like QuickNoteButton/WellnessQuickActionButton's plain
  // Fragment roots. Without this, a real flex-col wrapper div here would
  // absorb any width/flex classes passed via `className` (they'd land on
  // the button, not on the item that actually participates in the
  // caller's row), breaking equal-width distribution in a multi-button
  // strip — this was the root cause of a prior "tall action row" bug.
  return (
    <div className="contents">
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
        {isPending ? "Starting…" : label}
      </button>
      {error && <p className="font-sans text-xs text-danger-text">{error}</p>}
    </div>
  );
}
