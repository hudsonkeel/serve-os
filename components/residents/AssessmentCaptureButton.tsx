"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";

interface AssessmentCaptureButtonProps {
  residentId: string;
  /** Overrides the button's own classes (e.g. equal-width sibling next to
   * QuickNoteButton in the person header). */
  className?: string;
}

// Native Serve OS capture route as of the 2026-08-15 architecture decision — previously this
// called startAssessmentCapture() (lib/actions/assessmentCapture.ts) and window.open()'d an
// opaque-handoff-code URL into the external serve-intake.netlify.app deployment. That function
// and the external Intake app both remain fully intact and reachable (the Intake app is the
// deliberate reference/fallback implementation until the native path is proven) — this button
// simply no longer points at it by default. Session creation/auth now happen entirely
// server-side on the target page itself (app/residents/[id]/assessment/capture/page.tsx), so
// no client-side action call is needed here at all — this is now a plain navigation link.
export function AssessmentCaptureButton({ residentId, className }: AssessmentCaptureButtonProps) {
  return (
    <Link
      href={`/residents/${residentId}/assessment/capture`}
      className={
        className ??
        "flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-navy px-4 font-sans text-button font-medium text-white shadow-card transition-colors hover:bg-navy/90"
      }
    >
      <ClipboardList size={17} strokeWidth={1.75} />
      Assessment
    </Link>
  );
}
