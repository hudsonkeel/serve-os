"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { scheduleInfectionFollowUpAction } from "@/lib/actions/infections";
import { NEXT_FOLLOW_UP_PURPOSE_LABELS } from "./infectionFollowUpLabels";
import type { InfectionFollowUpPurpose } from "@/lib/supabase/types";

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

// Infection Lifecycle & Learning Loop v0.1 — the lightweight scheduling
// path, used right after review when follow-up is needed but there is
// nothing yet to report/observe (no infection_follow_ups row is written —
// see RecordInfectionFollowUpForm for the real observation entry, which
// sets these same columns as a side effect). Also the reschedule path:
// calling this again simply overwrites the current obligation — same
// underlying RPC and provenance model either way, see
// schedule_infection_follow_up's own comment for the "no history" v0.1
// limitation this component doesn't change.
//
// Follow-Up & Resolution UX Refinement — the closed-state trigger's label
// and prominence are caller-controlled (triggerLabel/triggerVariant), via
// the shared Button component, so InfectionFollowUpTimeline can present
// this as either half of an action pair or a modest ongoing control
// without this component needing to know which context it's in.
//
// Schedule/Reschedule Form UX Polish — the expanded form is no longer a
// narrow w-72 popover with tiny text-xs fields; it now uses the same
// full-width, real-field-size layout every other QAPI form in this app
// uses (see RecordInfectionFollowUpForm/CreateInfectionCorrectiveActionForm),
// with date+purpose side by side on desktop and a real heading/primary
// button that reads "Schedule" vs "Update Schedule" depending on whether
// an obligation already exists — so opening this to change an existing
// date pre-populates the current values instead of starting blank.
export function ScheduleInfectionFollowUpForm({
  infectionId,
  currentDate,
  currentPurpose,
  currentPurposeNote,
  triggerLabel = "Schedule Follow-Up",
  triggerVariant = "secondary",
}: {
  infectionId: string;
  currentDate?: string | null;
  currentPurpose?: InfectionFollowUpPurpose | null;
  currentPurposeNote?: string | null;
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [purpose, setPurpose] = useState<InfectionFollowUpPurpose | "">("");
  const [purposeNote, setPurposeNote] = useState("");

  const isReschedule = Boolean(currentDate);

  function handleOpen() {
    // Pre-populate with whatever is currently scheduled, every time the
    // form is opened — not just on this component's first mount — so
    // rescheduling starts from the real current obligation rather than a
    // blank form the operator has to re-type from scratch.
    setNextFollowUpDate(currentDate ?? "");
    setPurpose(currentPurpose ?? "");
    setPurposeNote(currentPurposeNote ?? "");
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!nextFollowUpDate) {
      setError("A follow-up date is required.");
      return;
    }
    if (!purpose) {
      setError("A follow-up purpose is required.");
      return;
    }

    startTransition(async () => {
      const res = await scheduleInfectionFollowUpAction({
        infectionId,
        nextFollowUpDate,
        purpose,
        purposeNote: purposeNote.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant={triggerVariant} size="small" onClick={handleOpen}>
        {triggerLabel}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-ivory-border bg-ivory-warm p-4">
      <p className="font-sans text-sm font-semibold text-body">{isReschedule ? "Reschedule Follow-Up" : "Schedule Follow-Up"}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>Next Follow-Up Date</span>
          <input
            type="date"
            value={nextFollowUpDate}
            onChange={(e) => setNextFollowUpDate(e.target.value)}
            className={fieldClassName}
          />
        </label>

        <label className="block">
          <span className={labelClassName}>Purpose</span>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value as InfectionFollowUpPurpose)} className={fieldClassName}>
            <option value="">Select…</option>
            {(Object.keys(NEXT_FOLLOW_UP_PURPOSE_LABELS) as InfectionFollowUpPurpose[]).map((value) => (
              <option key={value} value={value}>
                {NEXT_FOLLOW_UP_PURPOSE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={labelClassName}>Note (optional)</span>
        <input type="text" value={purposeNote} onChange={(e) => setPurposeNote(e.target.value)} className={fieldClassName} />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving…" : isReschedule ? "Update Schedule" : "Schedule"}
        </Button>
        <Button type="button" variant="secondary" disabled={isPending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
