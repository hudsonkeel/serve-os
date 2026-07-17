"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logRelationshipTouch } from "@/lib/actions/relationships";
import {
  RELATIONSHIP_TOUCH_TYPE_LABELS,
  RELATIONSHIP_TOUCH_TYPES,
} from "@/lib/relationships/constants";
import { RelationshipTouch, RelationshipTouchType } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface RelationshipTouchesSectionProps {
  relationshipId: string;
  touches: RelationshipTouch[];
}

export function RelationshipTouchesSection({ relationshipId, touches }: RelationshipTouchesSectionProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [touchType, setTouchType] = useState<RelationshipTouchType>("call");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [contactName, setContactName] = useState("");
  const [occurredAt, setOccurredAt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await logRelationshipTouch({
        relationshipId,
        touchType,
        summary,
        outcome,
        contactName,
        occurredAt,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsAdding(false);
      setSummary("");
      setOutcome("");
      setContactName("");
      setOccurredAt("");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Touches
        </h4>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            + Log Touch
          </button>
        )}
      </div>
      <p className="mb-4 font-sans text-sm text-subtle">
        Meaningful interactions with this person or family.
      </p>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Type
              </span>
              <select
                value={touchType}
                onChange={(e) => setTouchType(e.target.value as RelationshipTouchType)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              >
                {RELATIONSHIP_TOUCH_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_TOUCH_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                When
              </span>
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              What happened
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Spoke with Cary about possible recurring visits."
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
            />
          </label>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Contact (optional)
              </span>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Outcome (optional)
              </span>
              <input
                type="text"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save Touch"}
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              disabled={isPending}
              className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {touches.length > 0 ? (
        <div className="space-y-3">
          {touches.map((touch) => (
            <div key={touch.id} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="gold">{RELATIONSHIP_TOUCH_TYPE_LABELS[touch.touch_type]}</Badge>
                <span className="font-sans text-sm text-muted">{compactDate(touch.occurred_at)}</span>
              </div>
              <p className="font-sans text-sm text-body">{touch.summary}</p>
              {touch.outcome && <p className="mt-1 font-sans text-sm text-muted">Outcome: {touch.outcome}</p>}
              <p className="mt-1 font-sans text-sm text-subtle">Logged by {touch.created_by}</p>
            </div>
          ))}
        </div>
      ) : (
        !isAdding && <EmptyState description="No touches logged yet." />
      )}
    </div>
  );
}
