"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, HeartPulse, AlertTriangle, ClipboardEdit } from "lucide-react";
import { QuickNoteButton } from "./QuickNoteButton";
import { AssessmentCaptureButton } from "./AssessmentCaptureButton";
import { WellnessQuickActionButton } from "./WellnessQuickActionButton";
import { AddToProspectPipelineMenuItem } from "./AddToProspectPipelineMenuItem";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, MENU_TRIGGER_CLASS, MENU_ITEM_CLASS } from "@/components/ui/actionButtonStyles";

interface WorkWithThisPersonStripProps {
  residentId: string;
  residentDisplayName: string;
  relationshipId: string | null;
  // Reused, not re-derived: AssessmentSection.tsx's own "approved"/
  // "operationalized" status vocabulary, applied to the already-fetched
  // assessment sessions — see page.tsx. No new assessment-state logic.
  hasCompletedAssessment: boolean;
  // Reused from lib/relationships/duplicateDetection.ts's
  // findActiveResidentProspect() — true only when no open Resident
  // Prospect relationship already exists, so "Add to Prospect Pipeline"
  // never offers to create a second one.
  canAddToProspectPipeline: boolean;
  communityName: string | null;
  contactName: string;
  contactRelationship: string;
  contactPhone: string;
  contactEmail: string;
}

// Two-tier "where do I click to capture something" strip. Frequent
// actions (Add Note, Wellbeing Observation, Follow-up) plus the primary
// Assessment/Reassessment workflow stay directly visible; everything else
// (Record Significant Change, Update Current Needs, and — only when
// eligible — Add to Prospect Pipeline) lives behind "More ▾", same
// disclosure-menu pattern as RecruitingWorkflowActions.tsx.
//
// Assessment gets the filled navy primary treatment (it's a materially
// larger workflow than a note or follow-up); everything else uses the
// outlined secondary treatment — see components/ui/actionButtonStyles.ts.
//
// Layout: a compact toolbar, not equal-width cards — every button sizes
// to its own label (no flex-grow), so "Add Note" stays small and
// "Wellbeing Observation" only takes the room its longer label needs.
// whitespace-nowrap still guards against a label wrapping onto a second
// line WITHIN a button (the actual cause of a prior "tall action row"
// complaint, compounded by AssessmentCaptureButton's own wrapper div not
// passing sizing classes through — fixed separately in that file); if the
// row runs out of room, flexbox wraps whole buttons onto a new line —
// never text within one. More ▾ carries no grow/label padding at all — it
// stays the smallest control, at the far right.
export function WorkWithThisPersonStrip({
  residentId,
  residentDisplayName,
  relationshipId,
  hasCompletedAssessment,
  canAddToProspectPipeline,
  communityName,
  contactName,
  contactRelationship,
  contactPhone,
  contactEmail,
}: WorkWithThisPersonStripProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    function onOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [isMenuOpen]);

  const mainActionClass = " whitespace-nowrap";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuickNoteButton residentId={residentId} residentDisplayName={residentDisplayName} className={SECONDARY_BUTTON_CLASS + mainActionClass} />

      <WellnessQuickActionButton
        residentId={residentId}
        residentDisplayName={residentDisplayName}
        icon={HeartPulse}
        label="Wellbeing Observation"
        className={SECONDARY_BUTTON_CLASS + mainActionClass}
      />

      <Link
        href={relationshipId ? `/relationships/${relationshipId}#next-actions` : "#current-needs"}
        className={SECONDARY_BUTTON_CLASS + mainActionClass}
      >
        <CalendarClock size={17} strokeWidth={1.75} />
        Follow-up
      </Link>

      <AssessmentCaptureButton
        residentId={residentId}
        label={hasCompletedAssessment ? "Reassessment" : "Assessment"}
        className={PRIMARY_BUTTON_CLASS + mainActionClass}
      />

      <div className="relative flex-none" ref={menuRef}>
        <button type="button" onClick={() => setIsMenuOpen((open) => !open)} className={MENU_TRIGGER_CLASS + " w-24 px-3"}>
          More ▾
        </button>

        {isMenuOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-ivory-border bg-surface shadow-card-hover">
            <div onClick={() => setIsMenuOpen(false)}>
              <WellnessQuickActionButton
                residentId={residentId}
                residentDisplayName={residentDisplayName}
                icon={AlertTriangle}
                label="Record Significant Change"
                className={MENU_ITEM_CLASS}
              />
            </div>
            <a href="#current-needs" onClick={() => setIsMenuOpen(false)} className={MENU_ITEM_CLASS}>
              <ClipboardEdit size={17} strokeWidth={1.75} />
              Update Current Needs
            </a>
            {canAddToProspectPipeline && (
              <AddToProspectPipelineMenuItem
                residentId={residentId}
                residentName={residentDisplayName}
                communityName={communityName}
                contactName={contactName}
                contactRelationship={contactRelationship}
                contactPhone={contactPhone}
                contactEmail={contactEmail}
                className={MENU_ITEM_CLASS}
                onDone={() => setIsMenuOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
