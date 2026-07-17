"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createRelationship } from "@/lib/actions/relationships";
import {
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_STAGES,
  RELATIONSHIP_TYPE_LABELS,
} from "@/lib/relationships/constants";
import { PipelineStage, Relationship } from "@/lib/supabase/types";

interface StartRelationshipCardProps {
  residentId: string;
  residentName: string;
  communityName: string | null;
  initialContactName: string;
  initialContactRelationship: string;
  initialContactPhone: string;
  initialContactEmail: string;
  existingRelationships: Relationship[];
}

// "Start Relationship" — deliberately a manual, per-resident action, not
// something that runs automatically for imported residents (most have no
// active Serve engagement at all). See docs/design/RELATIONSHIPS.md.
export function StartRelationshipCard({
  residentId,
  residentName,
  communityName,
  initialContactName,
  initialContactRelationship,
  initialContactPhone,
  initialContactEmail,
  existingRelationships,
}: StartRelationshipCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(`${residentName} — Prospect`);
  const [stage, setStage] = useState<PipelineStage>("new_inquiry");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [firstActionTitle, setFirstActionTitle] = useState("");
  const [firstActionDueAt, setFirstActionDueAt] = useState("");

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createRelationship({
        relationshipType: "resident_prospect",
        stage,
        displayName,
        residentId,
        communityName: communityName ?? undefined,
        primaryContactName: initialContactName,
        primaryContactRelationship: initialContactRelationship,
        primaryContactPhone: initialContactPhone,
        primaryContactEmail: initialContactEmail,
        ownerLabel,
        priority: "normal",
        sourceType: "resident_page",
        firstActionTitle,
        firstActionType: "follow_up",
        firstActionDueAt,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-4 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Relationships
      </h3>

      {existingRelationships.length > 0 ? (
        <div className="mb-4 space-y-2">
          {existingRelationships.map((r) => (
            <Link
              key={r.id}
              href={`/relationships/${r.id}`}
              className="block rounded-lg border border-ivory-border bg-ivory px-4 py-3 hover:border-navy/20"
            >
              <p className="font-sans text-sm font-semibold text-body">{r.display_name}</p>
              <p className="mt-0.5 font-sans text-sm text-muted">
                {RELATIONSHIP_TYPE_LABELS[r.relationship_type]} · {RELATIONSHIP_STAGE_LABELS[r.stage]}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mb-4 font-sans text-sm text-subtle">
          No active Serve relationship recorded for this resident yet.
        </p>
      )}

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-md border border-ivory-border px-3 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm"
        >
          Start Relationship
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-ivory-border bg-ivory px-4 py-4">
          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Relationship Name
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Initial Stage
              </span>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as PipelineStage)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              >
                {RELATIONSHIP_STAGES.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_STAGE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Owner
              </span>
              <input
                type="text"
                value={ownerLabel}
                onChange={(e) => setOwnerLabel(e.target.value)}
                placeholder="e.g. Brian"
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                First Action (optional)
              </span>
              <input
                type="text"
                value={firstActionTitle}
                onChange={(e) => setFirstActionTitle(e.target.value)}
                placeholder="Call family"
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Due
              </span>
              <input
                type="date"
                value={firstActionDueAt}
                onChange={(e) => setFirstActionDueAt(e.target.value)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              />
            </label>
          </div>

          {(initialContactName || initialContactPhone) && (
            <p className="font-sans text-sm text-subtle">
              Primary contact pre-filled from Family Contacts: {initialContactName || "-"}
              {initialContactRelationship ? ` (${initialContactRelationship})` : ""}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Create Relationship"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
              className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
