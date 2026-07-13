import {
  ResidentWellnessNote,
  WellnessNotePriority,
  WellnessNoteSourceSystem,
  WellnessSignalType,
} from "@/lib/supabase/types";
import { OpenWellnessFollowUp } from "@/lib/data/wellnessFollowUps";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddWellnessNoteForm } from "./AddWellnessNoteForm";
import { DisplayFollowUp, OpenFollowUpsList } from "./OpenFollowUpsList";

function fullDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function compactDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SIGNAL_LABELS: Record<WellnessSignalType, string> = {
  general_wellness: "General Wellness",
  mobility: "Mobility",
  fall_risk: "Fall Risk",
  injury: "Recent Injury",
  pain: "Pain",
  medication: "Medication",
  nutrition_hydration: "Nutrition / Hydration",
  cognition: "Cognition",
  mood_behavior: "Mood / Behavior",
  sleep: "Sleep",
  personal_care: "Personal Care",
  continence: "Continence",
  sensory_change: "Sensory Change",
  hospital_rehab: "Hospital / Rehab",
  surgery_procedure: "Surgery / Procedure",
  return_from_rehab: "Return From Rehab",
  change_in_service_need: "Change in Service Need",
  environment_safety: "Environment / Safety",
  bathroom_safety: "Bathroom Safety",
  equipment: "Equipment",
  home_modification: "Home Modification",
  accessibility: "Accessibility",
  social_engagement: "Social Engagement",
  isolation: "Isolation",
  family_update: "Family Update",
  resident_preference: "Resident Preference",
  care_resistance: "Care Resistance",
  missed_task: "Missed Task",
  caregiver_concern: "Caregiver Concern",
  follow_up_needed: "Follow-Up Needed",
  other: "Other",
};

const PRIORITY_LABELS: Record<WellnessNotePriority, string> = {
  routine: "Routine",
  monitor: "Monitor",
  important: "Important",
  urgent: "Urgent",
};

const SOURCE_SYSTEM_LABELS: Record<WellnessNoteSourceSystem, string> = {
  serve_os: "Serve OS",
  cinch_ccm: "Cinch CCM",
  axiscare: "AxisCare",
  assessment: "Assessment",
  family: "Family",
  community_staff: "Community Staff",
  other: "Other",
};

interface WellnessNotesProps {
  residentId: string;
  notes: ResidentWellnessNote[];
  openFollowUps: OpenWellnessFollowUp[];
}

export function WellnessNotes({
  residentId,
  notes,
  openFollowUps,
}: WellnessNotesProps) {
  const observedAtBySourceId = new Map(notes.map((note) => [note.id, note.observed_at]));

  const displayFollowUps: DisplayFollowUp[] = openFollowUps.map((followUp) => ({
    ...followUp,
    sourceObservedAt:
      followUp.source_type === "wellness_observation" && followUp.source_id
        ? observedAtBySourceId.get(followUp.source_id) ?? null
        : null,
  }));

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-5">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Resident Wellness
        </h3>
        <p className="mt-1 font-sans text-sm text-subtle">
          Observations, changes, and follow-up actions related to this
          resident&apos;s wellbeing.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            Open Follow-Ups
          </p>
          <OpenFollowUpsList residentId={residentId} followUps={displayFollowUps} />
        </div>

        <div className="space-y-4 border-t border-ivory-border pt-5">
          <AddWellnessNoteForm residentId={residentId} />

          {notes.length > 0 ? (
            <div className="space-y-4">
              {notes.map((note) => {
                const isImported = note.source_system !== "serve_os";

                return (
                  <div
                    key={note.id}
                    className={`rounded-lg border px-5 py-4 ${
                      isImported
                        ? "border-amber-200 bg-warning-surface"
                        : "border-ivory-border bg-ivory"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {note.signals.map((signal) => (
                        <Badge key={signal} tone="gold">
                          {SIGNAL_LABELS[signal]}
                        </Badge>
                      ))}
                      {note.priority !== "routine" && (
                        <Badge tone={note.priority === "urgent" ? "danger" : "warning"}>
                          {PRIORITY_LABELS[note.priority]}
                        </Badge>
                      )}
                      <Badge tone={isImported ? "imported" : "neutral"}>
                        {isImported
                          ? `Imported — ${SOURCE_SYSTEM_LABELS[note.source_system]}`
                          : "Serve OS"}
                      </Badge>
                    </div>

                    <p className="font-sans text-sm text-muted">
                      {fullDateTime(note.observed_at)}
                    </p>

                    <p className="mt-2 font-sans text-base text-body">
                      {note.observation}
                    </p>

                    {(note.context || note.action_taken) && (
                      <div className="mt-2 space-y-1">
                        {note.context && (
                          <p className="font-sans text-sm text-muted">
                            Context: {note.context}
                          </p>
                        )}
                        {note.action_taken && (
                          <p className="font-sans text-sm text-muted">
                            Action taken: {note.action_taken}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mt-3 space-y-0.5 border-t border-ivory-border/70 pt-2.5">
                      <p className="font-sans text-sm text-muted">
                        {note.follow_up_required
                          ? `Follow-up needed by ${compactDate(note.follow_up_date)}`
                          : "No follow-up needed"}
                      </p>

                      {note.followUpCount > 0 && (
                        <p className="font-sans text-sm text-gold-dark">
                          {note.followUpCount === 1
                            ? "1 follow-up created"
                            : `${note.followUpCount} follow-ups created`}
                        </p>
                      )}

                      <p className="font-sans text-sm text-subtle">
                        Entered by {note.entered_by ?? "Unknown"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState description="No wellness observations have been recorded yet." />
          )}
        </div>
      </div>
    </div>
  );
}
