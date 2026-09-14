"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPlainDate } from "@/lib/utils/date";
import { RecordInfectionFollowUpForm } from "./RecordInfectionFollowUpForm";
import { ScheduleInfectionFollowUpForm } from "./ScheduleInfectionFollowUpForm";
import {
  INFORMATION_SOURCE_LABELS,
  NEXT_FOLLOW_UP_PURPOSE_LABELS,
  REPORTED_STATUS_LABELS,
  SERVICE_IMPACT_LABELS,
} from "./infectionFollowUpLabels";
import type { InfectionFollowUp, InfectionFollowUpPurpose } from "@/lib/supabase/types";

// Infection Lifecycle & Learning Loop v0.1 — the append-only longitudinal
// follow-up timeline, newest-first (matching this codebase's other
// day-grouped/chronological timelines' "most recent first" convention).
// No Incident analog: every entry here is its own permanent record of what
// was reported/observed, never edited or removed (see
// infection_follow_ups' own append-only DB trigger).
//
// Follow-Up & Resolution UX Refinement — this is now the one place the
// user actually does follow-up work (the Resolution card below only
// explains state and links back here; see InfectionResolutionCard). When
// follow-up was required at review and NOTHING has happened yet — no
// entry recorded, no date scheduled — that is a genuinely different,
// higher-urgency situation than "nothing recorded yet, but also nothing
// required or already scheduled," and reads that way: a prominent
// callout with a real primary action, not the same muted line and tiny
// pill button regardless of how much this record actually needs attention.
export function InfectionFollowUpTimeline({
  infectionId,
  followUps,
  followUpRequired,
  nextFollowUpDate,
  nextFollowUpPurpose,
  nextFollowUpPurposeNote,
  canAdd,
}: {
  infectionId: string;
  followUps: InfectionFollowUp[];
  followUpRequired: boolean;
  nextFollowUpDate: string | null;
  nextFollowUpPurpose: InfectionFollowUpPurpose | null;
  nextFollowUpPurposeNote: string | null;
  canAdd: boolean;
}) {
  const [showRecordForm, setShowRecordForm] = useState(false);
  const ordered = [...followUps].reverse();

  // Follow-up was required during review, but nothing has ever been
  // recorded AND nothing is currently scheduled either — the exact state
  // that must make the required next action unmistakable.
  const needsFollowUpNow = followUpRequired && followUps.length === 0 && nextFollowUpDate === null;

  return (
    <div className="space-y-3">
      {needsFollowUpNow && !showRecordForm && (
        <div className="rounded-lg border border-ivory-border bg-overdue-surface p-4">
          <Badge tone="danger">Follow-up needed</Badge>
          <p className="mt-2 font-sans text-sm font-medium text-body">No follow-up has been recorded yet.</p>
          <p className="mt-1 font-sans text-sm text-muted">
            Review the resident&apos;s current reported status, service impact, and any updated instructions relevant to
            Serve&apos;s services.
          </p>
          {canAdd && (
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <Button type="button" variant="primary" onClick={() => setShowRecordForm(true)}>
                Record Follow-Up
              </Button>
              <ScheduleInfectionFollowUpForm
                infectionId={infectionId}
                currentDate={nextFollowUpDate}
                currentPurpose={nextFollowUpPurpose}
                currentPurposeNote={nextFollowUpPurposeNote}
                triggerLabel="Schedule for Later"
                triggerVariant="secondary"
              />
            </div>
          )}
        </div>
      )}

      {!needsFollowUpNow && ordered.length === 0 && !showRecordForm && (
        <p className="font-sans text-sm text-muted">No follow-ups recorded yet.</p>
      )}

      {ordered.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-ivory-border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="blue">{REPORTED_STATUS_LABELS[entry.reported_status]}</Badge>
              <Badge tone="neutral">{SERVICE_IMPACT_LABELS[entry.service_impact]}</Badge>
            </div>
            <p className="font-sans text-xs text-subtle">
              {entry.created_by} · {formatPlainDate(entry.created_at) ?? entry.created_at}
            </p>
          </div>

          <p className="mt-2 font-sans text-xs text-muted">
            Reported by: {INFORMATION_SOURCE_LABELS[entry.information_source]}
          </p>

          {entry.serve_response.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.serve_response.map((label) => (
                <span key={label} className="rounded-full bg-ivory-warm px-2.5 py-0.5 font-sans text-[11px] text-body">
                  {label}
                </span>
              ))}
            </div>
          )}

          {entry.narrative_note && (
            <p className="mt-2 whitespace-pre-wrap font-sans text-sm text-body">{entry.narrative_note}</p>
          )}

          <p className="mt-2 font-sans text-xs text-subtle">
            {entry.additional_follow_up_required && entry.next_follow_up_date && entry.next_follow_up_purpose
              ? `Additional follow-up scheduled ${formatPlainDate(entry.next_follow_up_date) ?? entry.next_follow_up_date} — ${NEXT_FOLLOW_UP_PURPOSE_LABELS[entry.next_follow_up_purpose]}${entry.next_follow_up_purpose_note ? `: ${entry.next_follow_up_purpose_note}` : ""}`
              : "No additional follow-up scheduled from this entry."}
          </p>
        </div>
      ))}

      {showRecordForm && <RecordInfectionFollowUpForm infectionId={infectionId} onDone={() => setShowRecordForm(false)} />}

      {/* Ongoing actions — once the acute "nothing has happened yet" state
          above no longer applies (something is already recorded and/or
          scheduled, or follow-up was never required at all), adding
          another follow-up or (re)scheduling one is a genuinely optional,
          lower-urgency action — still a real Button, never the old tiny
          text-xs pill, but secondary-weight rather than the primary
          callout above. */}
      {canAdd && !needsFollowUpNow && !showRecordForm && (
        <div className="flex flex-wrap items-start gap-2">
          <Button type="button" variant="secondary" size="small" onClick={() => setShowRecordForm(true)}>
            Record Follow-Up
          </Button>
          <ScheduleInfectionFollowUpForm
            infectionId={infectionId}
            currentDate={nextFollowUpDate}
            currentPurpose={nextFollowUpPurpose}
            currentPurposeNote={nextFollowUpPurposeNote}
            triggerLabel={nextFollowUpDate ? "Reschedule Follow-Up" : "Schedule Follow-Up"}
            triggerVariant="secondary"
          />
        </div>
      )}
    </div>
  );
}
