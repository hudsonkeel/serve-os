"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { recordInfectionFollowUpAction } from "@/lib/actions/infections";
import {
  INFORMATION_SOURCE_LABELS,
  NEXT_FOLLOW_UP_PURPOSE_LABELS,
  REPORTED_STATUS_LABELS,
  SERVE_RESPONSE_SUGGESTIONS,
  SERVICE_IMPACT_LABELS,
} from "./infectionFollowUpLabels";
import type {
  InfectionFollowUpInformationSource,
  InfectionFollowUpPurpose,
  InfectionFollowUpReportedStatus,
  InfectionFollowUpServiceImpact,
} from "@/lib/supabase/types";

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName = "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

// Infection Lifecycle & Learning Loop v0.1 — the real follow-up observation
// entry, appended to infection_follow_ups (no Incident analog). Narrative
// is optional: structured status/service-impact/Serve-response data may
// fully describe a routine follow-up, so free text is required only where
// an "Other" choice genuinely needs explanation — the client-side check
// below mirrors record_infection_follow_up's own DB constraint exactly, so
// the form never lets a submission reach the RPC only to be rejected for a
// reason it could have caught first.
export function RecordInfectionFollowUpForm({ infectionId, onDone }: { infectionId: string; onDone?: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [reportedStatus, setReportedStatus] = useState<InfectionFollowUpReportedStatus | "">("");
  const [serviceImpact, setServiceImpact] = useState<InfectionFollowUpServiceImpact | "">("");
  const [serveResponse, setServeResponse] = useState<string[]>([]);
  const [narrativeNote, setNarrativeNote] = useState("");
  const [informationSource, setInformationSource] = useState<InfectionFollowUpInformationSource | "">("");

  const [additionalFollowUpRequired, setAdditionalFollowUpRequired] = useState<"yes" | "no" | null>(null);
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [nextFollowUpPurpose, setNextFollowUpPurpose] = useState<InfectionFollowUpPurpose | "">("");
  const [nextFollowUpPurposeNote, setNextFollowUpPurposeNote] = useState("");

  const narrativeRequired = reportedStatus === "other" || serviceImpact === "other";

  function toggleServeResponse(label: string) {
    setServeResponse((current) => (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!reportedStatus) {
      setError("Please select the reported status.");
      return;
    }
    if (!serviceImpact) {
      setError("Please select the service impact.");
      return;
    }
    if (!informationSource) {
      setError("Please select an information source.");
      return;
    }
    if (narrativeRequired && !narrativeNote.trim()) {
      setError('A narrative note is required when "Other" is selected for reported status or service impact.');
      return;
    }
    if (additionalFollowUpRequired === null) {
      setError("Please indicate whether additional follow-up is required.");
      return;
    }
    if (additionalFollowUpRequired === "yes" && !nextFollowUpDate) {
      setError("A next follow-up date is required.");
      return;
    }
    if (additionalFollowUpRequired === "yes" && !nextFollowUpPurpose) {
      setError("A next follow-up purpose is required.");
      return;
    }

    startTransition(async () => {
      const res = await recordInfectionFollowUpAction({
        infectionId,
        reportedStatus,
        serviceImpact,
        serveResponse,
        narrativeNote: narrativeNote.trim() || null,
        informationSource,
        additionalFollowUpRequired: additionalFollowUpRequired === "yes",
        nextFollowUpDate: additionalFollowUpRequired === "yes" ? nextFollowUpDate : null,
        nextFollowUpPurpose: additionalFollowUpRequired === "yes" ? (nextFollowUpPurpose || null) : null,
        nextFollowUpPurposeNote: additionalFollowUpRequired === "yes" ? nextFollowUpPurposeNote.trim() || null : null,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      router.refresh();
      onDone?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-ivory-border bg-ivory-warm p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName}>Reported Status</span>
          <select
            value={reportedStatus}
            onChange={(e) => setReportedStatus(e.target.value as InfectionFollowUpReportedStatus)}
            className={fieldClassName}
          >
            <option value="">Select…</option>
            {(Object.keys(REPORTED_STATUS_LABELS) as InfectionFollowUpReportedStatus[]).map((value) => (
              <option key={value} value={value}>
                {REPORTED_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClassName}>Service Impact</span>
          <select
            value={serviceImpact}
            onChange={(e) => setServiceImpact(e.target.value as InfectionFollowUpServiceImpact)}
            className={fieldClassName}
          >
            <option value="">Select…</option>
            {(Object.keys(SERVICE_IMPACT_LABELS) as InfectionFollowUpServiceImpact[]).map((value) => (
              <option key={value} value={value}>
                {SERVICE_IMPACT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={labelClassName}>Information Source</span>
        <select
          value={informationSource}
          onChange={(e) => setInformationSource(e.target.value as InfectionFollowUpInformationSource)}
          className={fieldClassName}
        >
          <option value="">Select…</option>
          {(Object.keys(INFORMATION_SOURCE_LABELS) as InfectionFollowUpInformationSource[]).map((value) => (
            <option key={value} value={value}>
              {INFORMATION_SOURCE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className={labelClassName}>Serve Response (select all that apply)</span>
        <div className="flex flex-wrap gap-1.5">
          {SERVE_RESPONSE_SUGGESTIONS.map((label) => {
            const selected = serveResponse.includes(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleServeResponse(label)}
                className={`rounded-full border px-3 py-1 font-sans text-xs ${
                  selected ? "border-navy bg-navy text-white" : "border-ivory-border bg-surface text-body hover:border-navy/30"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className={labelClassName}>
          Narrative Note {narrativeRequired ? "(required)" : "(optional)"}
        </span>
        <AutoGrowTextarea
          value={narrativeNote}
          onChange={(e) => setNarrativeNote(e.target.value)}
          minRows={2}
          placeholder={
            narrativeRequired
              ? 'Please explain the "Other" selection above.'
              : "Add context only if the structured fields above don't fully describe this follow-up."
          }
        />
      </label>

      <div className="border-t border-ivory-border pt-4">
        <span className={labelClassName}>Is additional follow-up required?</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 font-sans text-sm text-body">
            <input
              type="radio"
              name="additionalFollowUp"
              checked={additionalFollowUpRequired === "yes"}
              onChange={() => setAdditionalFollowUpRequired("yes")}
            />
            Yes
          </label>
          <label className="flex items-center gap-2 font-sans text-sm text-body">
            <input
              type="radio"
              name="additionalFollowUp"
              checked={additionalFollowUpRequired === "no"}
              onChange={() => setAdditionalFollowUpRequired("no")}
            />
            No
          </label>
        </div>

        {additionalFollowUpRequired === "yes" && (
          <div className="mt-3 space-y-4">
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
                <select
                  value={nextFollowUpPurpose}
                  onChange={(e) => setNextFollowUpPurpose(e.target.value as InfectionFollowUpPurpose)}
                  className={fieldClassName}
                >
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
              <span className={labelClassName}>Purpose Note (optional)</span>
              <input
                type="text"
                value={nextFollowUpPurposeNote}
                onChange={(e) => setNextFollowUpPurposeNote(e.target.value)}
                className={fieldClassName}
              />
            </label>
          </div>
        )}
      </div>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Saving…" : "Record Follow-Up"}
        </Button>
        {onDone && (
          <Button type="button" onClick={onDone} disabled={isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
