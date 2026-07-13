"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRelationshipDetails } from "@/lib/actions/connections";
import { RelationshipStage } from "@/lib/supabase/types";

const RELATIONSHIP_STAGE_OPTIONS: { value: RelationshipStage; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "introduced", label: "Introduced" },
  { value: "acquaintance", label: "Acquaintance" },
  { value: "familiar", label: "Familiar" },
  { value: "established_relationship", label: "Established Relationship" },
];

const RELATIONSHIP_STAGE_LABELS: Record<RelationshipStage, string> = {
  unknown: "Unknown",
  introduced: "Introduced",
  acquaintance: "Acquaintance",
  familiar: "Familiar",
  established_relationship: "Established Relationship",
};

interface RelationshipDetailsCardProps {
  residentId: string;
  initialPreferredName: string;
  initialRelationshipStage: RelationshipStage;
}

export function RelationshipDetailsCard({
  residentId,
  initialPreferredName,
  initialRelationshipStage,
}: RelationshipDetailsCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferredName, setPreferredName] = useState(initialPreferredName);
  const [relationshipStage, setRelationshipStage] = useState<RelationshipStage>(
    initialRelationshipStage
  );

  function handleEdit() {
    setPreferredName(initialPreferredName);
    setRelationshipStage(initialRelationshipStage);
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setPreferredName(initialPreferredName);
    setRelationshipStage(initialRelationshipStage);
    setError(null);
    setIsEditing(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateRelationshipDetails({
        residentId,
        preferredName,
        relationshipStage,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setIsEditing(false);
      router.refresh();
    });
  }

  if (!isEditing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Preferred Name / Goes By
            </p>
            <p className="mt-0.5 font-sans text-sm text-body">
              {initialPreferredName || "-"}
            </p>
          </div>
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Relationship Stage
            </p>
            <p className="mt-0.5 font-sans text-sm text-body">
              {RELATIONSHIP_STAGE_LABELS[initialRelationshipStage]}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleEdit}
          className="shrink-0 font-sans text-sm font-medium text-muted transition-colors hover:text-body"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Preferred Name / Goes By
          </span>
          <input
            type="text"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            placeholder="e.g. Mick"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Relationship Stage
          </span>
          <select
            value={relationshipStage}
            onChange={(e) =>
              setRelationshipStage(e.target.value as RelationshipStage)
            }
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {RELATIONSHIP_STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
