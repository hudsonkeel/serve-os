"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRelationship } from "@/lib/actions/relationships";
import {
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_ACTION_TYPES,
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_STAGES,
} from "@/lib/relationships/constants";
import { PipelineStage, RelationshipActionType, RelationshipPriority } from "@/lib/supabase/types";

interface AddExternalProspectFormProps {
  onDone: () => void;
}

export function AddExternalProspectForm({ onDone }: AddExternalProspectFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactRelationship, setPrimaryContactRelationship] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [prospectiveResidentName, setProspectiveResidentName] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [stage, setStage] = useState<PipelineStage>("new_inquiry");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [priority, setPriority] = useState<RelationshipPriority>("normal");
  const [firstActionTitle, setFirstActionTitle] = useState("");
  const [firstActionType, setFirstActionType] = useState<RelationshipActionType>("call");
  const [firstActionDueAt, setFirstActionDueAt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createRelationship({
        relationshipType: "external_prospect",
        stage,
        displayName,
        communityName,
        primaryContactName,
        primaryContactRelationship,
        primaryContactPhone,
        primaryContactEmail,
        prospectiveResidentName,
        summary,
        ownerLabel,
        priority,
        sourceType: "manual",
        sourceLabel,
        firstActionTitle,
        firstActionType,
        firstActionDueAt,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onDone();
      if (result.id) {
        router.push(`/relationships/${result.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-ivory-border bg-ivory p-6"
    >
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Add External Prospect
      </p>
      <p className="-mt-2 font-sans text-sm text-subtle">
        For a family or inquiry not yet connected to a resident record.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Relationship Name
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Smith Family Inquiry"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Prospective Resident (optional)
          </span>
          <input
            type="text"
            value={prospectiveResidentName}
            onChange={(e) => setProspectiveResidentName(e.target.value)}
            placeholder="Margaret Smith"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Primary Contact Name
          </span>
          <input
            type="text"
            value={primaryContactName}
            onChange={(e) => setPrimaryContactName(e.target.value)}
            placeholder="Jennifer Smith"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Relationship to Prospective Resident
          </span>
          <input
            type="text"
            value={primaryContactRelationship}
            onChange={(e) => setPrimaryContactRelationship(e.target.value)}
            placeholder="Daughter"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Phone
          </span>
          <input
            type="tel"
            value={primaryContactPhone}
            onChange={(e) => setPrimaryContactPhone(e.target.value)}
            placeholder="(555) 555-5555"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Email
          </span>
          <input
            type="email"
            value={primaryContactEmail}
            onChange={(e) => setPrimaryContactEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Community (optional)
          </span>
          <input
            type="text"
            value={communityName}
            onChange={(e) => setCommunityName(e.target.value)}
            placeholder="Watermere at Frisco"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Source
          </span>
          <input
            type="text"
            value={sourceLabel}
            onChange={(e) => setSourceLabel(e.target.value)}
            placeholder="Website inquiry, referral, phone call..."
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />
        </label>

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

        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Priority
          </span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as RelationshipPriority)}
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
          >
            {RELATIONSHIP_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {RELATIONSHIP_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Summary (optional)
        </span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
        />
      </label>

      <div className="rounded-lg border border-ivory-border bg-surface px-4 py-3">
        <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Next Action
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              What&apos;s next
            </span>
            <input
              type="text"
              value={firstActionTitle}
              onChange={(e) => setFirstActionTitle(e.target.value)}
              placeholder="Call Jennifer"
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Type
            </span>
            <select
              value={firstActionType}
              onChange={(e) => setFirstActionType(e.target.value as RelationshipActionType)}
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
            >
              {RELATIONSHIP_ACTION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {RELATIONSHIP_ACTION_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
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
        <p className="mt-2 font-sans text-sm text-subtle">
          Leave blank if there&apos;s nothing due yet — the relationship will show as &quot;No Next Action&quot;.
        </p>
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
          {isPending ? "Saving..." : "Save Relationship"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={isPending}
          className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
