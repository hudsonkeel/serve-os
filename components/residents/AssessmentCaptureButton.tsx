import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { nativeCaptureHref } from "@/lib/assessmentCapture/captureLogic";

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

// The one assessment-recording action in Serve OS (Assessment Mobile Capture,
// 2026-09-30): opens native in-app capture at /residents/[id]/assessment/capture
// instead of minting a handoff code and window.open()-ing the legacy external
// recorder (serve-intake.netlify.app). Nothing from that handoff needs
// preserving here: the handoff code only carried resident + actor identity
// across sites, which the same-origin capture page derives from the signed-in
// session itself; the capture page and every capture server action enforce
// canCaptureResidentAssessment (the same predicate that gates rendering this
// button) plus community scope; and a session is created only when the
// assessor taps Start there — never by navigating — so prefetching this link
// creates nothing. startAssessmentCapture() (lib/actions/assessmentCapture.ts)
// is no longer called from the UI and is left in place unchanged.
//
// display:contents on the wrapper — the link becomes a direct flex item of
// whatever row this is placed in, exactly like QuickNoteButton/
// WellnessQuickActionButton's plain Fragment roots, so width/flex classes
// passed via `className` keep working in a multi-button strip.
export function AssessmentCaptureButton({ residentId, className, label = "Assessment" }: AssessmentCaptureButtonProps) {
  return (
    <div className="contents">
      <Link
        href={nativeCaptureHref(residentId)}
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
