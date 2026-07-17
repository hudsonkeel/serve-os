"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addConnectionNote } from "@/lib/actions/connections";
import {
  isConfirmedByResident,
  mapSimpleConfidenceToConfidence,
  mapSimpleLearnedTypeToInterestType,
  mapSimpleSourceToSourceType,
  SIMPLE_CONFIDENCE_OPTIONS,
  SIMPLE_LEARNED_TYPE_OPTIONS,
  SIMPLE_SOURCE_OPTIONS,
  SimpleConfidence,
  SimpleLearnedType,
  SimpleSource,
} from "@/lib/gettingToKnow/mapping";

type SubmitState = "idle" | "submitting" | "success" | "error";

export function AddSomethingWeLearnedForm({ residentId }: { residentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [learnedType, setLearnedType] = useState<SimpleLearnedType>("favorite_interest");
  const [interestValue, setInterestValue] = useState("");
  const [source, setSource] = useState<SimpleSource>("serve_staff_observed");
  const [details, setDetails] = useState("");
  const [confidence, setConfidence] = useState<SimpleConfidence>("observed");

  function resetFields() {
    setLearnedType("favorite_interest");
    setInterestValue("");
    setSource("serve_staff_observed");
    setDetails("");
    setConfidence("observed");
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
        interestType: mapSimpleLearnedTypeToInterestType(learnedType),
        interestValue,
        details,
        sourceType: mapSimpleSourceToSourceType(source),
        confidence: mapSimpleConfidenceToConfidence(confidence),
        confirmedByResident: isConfirmedByResident(confidence),
        supportsFutureTouch: false,
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
        Add Something We Learned
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
          Add Something We Learned
        </p>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="font-sans text-sm text-muted transition-colors hover:text-body"
        >
          Close
        </button>
      </div>

      <div className="space-y-1 rounded-lg border border-ivory-border bg-surface px-4 py-3">
        <p className="font-sans text-sm text-subtle">
          <span className="font-semibold text-muted">Use Current Needs for: </span>
          ongoing care, mobility, safety, and support needs.{" "}
          <a
            href="#current-needs"
            className="font-medium text-navy underline-offset-2 hover:underline"
          >
            Go to Current Needs
          </a>
        </p>
        <p className="font-sans text-sm text-subtle">
          <span className="font-semibold text-muted">Use Working Notes for: </span>
          pending decisions, follow-ups, and things currently in motion.{" "}
          <a
            href="#working-notes"
            className="font-medium text-navy underline-offset-2 hover:underline"
          >
            Go to Working Notes
          </a>
        </p>
        <p className="font-sans text-sm text-subtle">
          <span className="font-semibold text-muted">Timeline records: </span>
          calls, emails, assessments, and completed events.{" "}
          <a
            href="#timeline"
            className="font-medium text-navy underline-offset-2 hover:underline"
          >
            View Timeline
          </a>
        </p>
        <p className="font-sans text-sm text-subtle">
          <span className="font-semibold text-muted">Use Getting to Know for: </span>
          interests, preferences, family context, and conversation cues.
        </p>
      </div>

      <div>
        <label
          htmlFor="learned-value"
          className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
        >
          What did we learn?
        </label>
        <input
          id="learned-value"
          type="text"
          value={interestValue}
          onChange={(e) => setInterestValue(e.target.value)}
          placeholder="Joann enjoys talking about Baylor football."
          className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="learned-type"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Type
          </label>
          <select
            id="learned-type"
            value={learnedType}
            onChange={(e) => setLearnedType(e.target.value as SimpleLearnedType)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {SIMPLE_LEARNED_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="learned-source"
            className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
          >
            Source
          </label>
          <select
            id="learned-source"
            value={source}
            onChange={(e) => setSource(e.target.value as SimpleSource)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {SIMPLE_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="learned-details"
          className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
        >
          Details (optional)
        </label>
        <textarea
          id="learned-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          placeholder="Baylor pennant observed beside the front door. Her son later confirmed she attended Baylor."
          className="w-full rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
        />
      </div>

      <div>
        <label
          htmlFor="learned-confidence"
          className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle"
        >
          Confidence
        </label>
        <select
          id="learned-confidence"
          value={confidence}
          onChange={(e) => setConfidence(e.target.value as SimpleConfidence)}
          className="w-full max-w-xs rounded-md border border-ivory-border bg-surface px-3.5 py-2.5 font-sans text-base text-body outline-none focus:border-gold/60"
        >
          {SIMPLE_CONFIDENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {status === "success" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
          Saved.
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
        {isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
