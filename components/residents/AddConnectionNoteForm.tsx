"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addConnectionNote } from "@/lib/actions/connections";
import {
  ConnectionSourceType,
  InterestConfidence,
  InterestType,
} from "@/lib/supabase/types";

const INTEREST_TYPE_OPTIONS: { value: InterestType; label: string }[] = [
  { value: "college", label: "College" },
  { value: "sports_team", label: "Sports Team" },
  { value: "hobby", label: "Hobby" },
  { value: "former_profession", label: "Former Profession" },
  { value: "military_service", label: "Military Service" },
  { value: "hometown", label: "Hometown" },
  { value: "travel", label: "Travel" },
  { value: "music", label: "Music" },
  { value: "books", label: "Books" },
  { value: "pets", label: "Pets" },
  { value: "family", label: "Family" },
  { value: "community_activity", label: "Community Activity" },
  { value: "food", label: "Food" },
  { value: "faith_or_tradition", label: "Faith or Tradition" },
  { value: "conversation_topic", label: "Conversation Topic" },
  { value: "other", label: "Other" },
];

const SOURCE_TYPE_OPTIONS: { value: ConnectionSourceType; label: string }[] = [
  { value: "resident_shared", label: "Shared by resident" },
  { value: "family_shared", label: "Shared by family" },
  { value: "staff_observation", label: "Observed by staff" },
  { value: "staff_conversation", label: "Staff conversation" },
  { value: "imported", label: "Imported" },
  { value: "other", label: "Other" },
];

const CONFIDENCE_OPTIONS: { value: InterestConfidence; label: string }[] = [
  { value: "unconfirmed", label: "Unconfirmed" },
  { value: "probable", label: "Probable" },
  { value: "confirmed", label: "Confirmed" },
];

type SubmitState = "idle" | "submitting" | "success" | "error";

export function AddConnectionNoteForm({ residentId }: { residentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [interestType, setInterestType] = useState<InterestType>("hobby");
  const [interestValue, setInterestValue] = useState("");
  const [details, setDetails] = useState("");
  const [sourceType, setSourceType] = useState<ConnectionSourceType>(
    "staff_observation"
  );
  const [sourceNote, setSourceNote] = useState("");
  const [confidence, setConfidence] = useState<InterestConfidence>("unconfirmed");
  const [confirmedByResident, setConfirmedByResident] = useState(false);
  const [supportsFutureTouch, setSupportsFutureTouch] = useState(false);

  function resetFields() {
    setInterestType("hobby");
    setInterestValue("");
    setDetails("");
    setSourceType("staff_observation");
    setSourceNote("");
    setConfidence("unconfirmed");
    setConfirmedByResident(false);
    setSupportsFutureTouch(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!interestValue.trim()) {
      setStatus("error");
      setError("Describe what was learned.");
      return;
    }

    setStatus("submitting");
    startTransition(async () => {
      const result = await addConnectionNote({
        residentId,
        interestType,
        interestValue,
        details,
        sourceType,
        sourceNote,
        confidence,
        confirmedByResident,
        supportsFutureTouch,
      });

      if (result.error) {
        setStatus("error");
        setError(result.error);
        return;
      }

      setStatus("success");
      resetFields();
      router.refresh();
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setStatus("idle");
          setError(null);
        }}
        className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
      >
        Add Connection Note
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-ivory-border bg-ivory px-4 py-4"
    >
      <div className="flex items-center justify-between">
        <p className="font-sans text-sm font-semibold uppercase tracking-widest text-muted">
          Add Connection Note
        </p>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="font-sans text-sm text-muted transition-colors hover:text-body"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="interest-type"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Category
          </label>
          <select
            id="interest-type"
            value={interestType}
            onChange={(e) => setInterestType(e.target.value as InterestType)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {INTEREST_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="interest-source-type"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Source
          </label>
          <select
            id="interest-source-type"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as ConnectionSourceType)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {SOURCE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="interest-value"
          className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
        >
          What was learned
        </label>
        <input
          id="interest-value"
          type="text"
          value={interestValue}
          onChange={(e) => setInterestValue(e.target.value)}
          placeholder="e.g. Loves talking about her grandkids in Austin"
          className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
        />
      </div>

      <div>
        <label
          htmlFor="interest-details"
          className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
        >
          Details (optional)
        </label>
        <textarea
          id="interest-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="interest-confidence"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Confidence
          </label>
          <select
            id="interest-confidence"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as InterestConfidence)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {CONFIDENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="interest-source-note"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Source note (optional)
          </label>
          <input
            id="interest-source-note"
            type="text"
            value={sourceNote}
            onChange={(e) => setSourceNote(e.target.value)}
            placeholder="e.g. Mentioned during lunch on 7/9"
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 font-sans text-sm text-body">
          <input
            type="checkbox"
            checked={confirmedByResident}
            onChange={(e) => setConfirmedByResident(e.target.checked)}
            className="h-4 w-4 rounded border-ivory-border"
          />
          Confirmed by resident
        </label>
        <label className="flex items-center gap-2 font-sans text-sm text-body">
          <input
            type="checkbox"
            checked={supportsFutureTouch}
            onChange={(e) => setSupportsFutureTouch(e.target.checked)}
            className="h-4 w-4 rounded border-ivory-border"
          />
          Supports future touch
        </label>
      </div>

      {status === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
          Connection note saved.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save Connection Note"}
      </button>
    </form>
  );
}
