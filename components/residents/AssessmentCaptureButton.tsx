import Link from "next/link";
import { ClipboardList } from "lucide-react";

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

// Native Serve OS capture route as of the 2026-08-15 architecture decision — previously this
// called startAssessmentCapture() (lib/actions/assessmentCapture.ts) and window.open()'d an
// opaque-handoff-code URL into the external serve-intake.netlify.app deployment. That function
// and the external Intake app both remain fully intact and reachable (the Intake app is the
// deliberate reference/fallback implementation until the native path is proven) — this button
// simply no longer points at it by default. Session creation/auth now happen entirely
// server-side on the target page itself (app/residents/[id]/assessment/capture/page.tsx), so
// no client-side action call is needed here at all — this is now a plain navigation link, which
// is also why this is no longer a "use client" component.
export function AssessmentCaptureButton({ residentId, className, label = "Assessment" }: AssessmentCaptureButtonProps) {
  // display:contents on the wrapper — the button becomes a direct flex item of whatever row
  // this is placed in, exactly like QuickNoteButton/WellnessQuickActionButton's plain Fragment
  // roots. Without this, a real flex-col wrapper div here would absorb any width/flex classes
  // passed via `className` (they'd land on the button, not on the item that actually
  // participates in the caller's row), breaking equal-width distribution in a multi-button
  // strip — this was the root cause of a prior "tall action row" bug.
  return (
    <div className="contents">
      <Link
        href={`/residents/${residentId}/assessment/capture`}
        className={
          className ??
          "flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-navy px-4 font-sans text-button font-medium text-white shadow-card transition-colors hover:bg-navy/90"
        }
      >
        <ClipboardList size={17} strokeWidth={1.75} />
        {label}
      </Link>
    </div>
  );
}
