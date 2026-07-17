"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { changeRelationshipStage, linkRelationshipToResident, searchResidentsForLinking } from "@/lib/actions/relationships";
import {
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_STAGES,
  RELATIONSHIP_TYPE_LABELS,
} from "@/lib/relationships/constants";
import { Relationship, PipelineStage } from "@/lib/supabase/types";
import { ResidentSearchResult } from "@/lib/data/relationships";
import { Badge } from "@/components/ui/Badge";

function compactDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StageChanger({ relationship }: { relationship: Relationship }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [stage, setStage] = useState<PipelineStage>(relationship.stage);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await changeRelationshipStage({ relationshipId: relationship.id, toStage: stage });
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
      <div className="flex items-center gap-2">
        <Badge tone="gold">{RELATIONSHIP_STAGE_LABELS[relationship.stage]}</Badge>
        <button
          type="button"
          onClick={() => {
            setStage(relationship.stage);
            setIsEditing(true);
          }}
          className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
        >
          Change Stage
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value as PipelineStage)}
        className="rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60"
      >
        {RELATIONSHIP_STAGES.map((value) => (
          <option key={value} value={value}>
            {RELATIONSHIP_STAGE_LABELS[value]}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        disabled={isPending}
        className="font-sans text-sm text-muted hover:text-body"
      >
        Cancel
      </button>
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
    </div>
  );
}

function LinkResident({
  relationship,
  linkedResidentName,
}: {
  relationship: Relationship;
  linkedResidentName: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingResident, setPendingResident] = useState<ResidentSearchResult | null>(null);

  async function handleSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    const found = await searchResidentsForLinking(value);
    setResults(found);
  }

  function handleLink(resident: ResidentSearchResult, force: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await linkRelationshipToResident({
        relationshipId: relationship.id,
        residentId: resident.id,
        force,
      });

      if (result.alreadyLinked) {
        setPendingResident(resident);
        return;
      }

      if (result.error) {
        setError(result.error);
        return;
      }

      setIsSearching(false);
      setPendingResident(null);
      router.refresh();
    });
  }

  if (relationship.resident_id) {
    return (
      <p className="font-sans text-sm text-body">
        Linked to{" "}
        <Link href={`/residents/${relationship.resident_id}`} className="text-navy hover:text-navy-light">
          {linkedResidentName ?? "resident"}
        </Link>
        {!isSearching && (
          <button
            type="button"
            onClick={() => setIsSearching(true)}
            className="ml-2 font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            Change
          </button>
        )}
      </p>
    );
  }

  if (!isSearching) {
    return (
      <button
        type="button"
        onClick={() => setIsSearching(true)}
        className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
      >
        Link Existing Resident
      </button>
    );
  }

  return (
    <div className="max-w-sm">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search by resident name or apartment..."
        className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none placeholder:text-subtle focus:border-gold/60"
      />
      {results.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-md border border-ivory-border bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => handleLink(r, false)}
                disabled={isPending}
                className="w-full px-3 py-2 text-left font-sans text-sm text-body hover:bg-ivory-warm disabled:cursor-not-allowed"
              >
                {r.name}
                {r.unitNumber ? ` — Unit ${r.unitNumber}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingResident && (
        <div className="mt-2 rounded-md border border-amber-200 bg-warning-surface px-3 py-2">
          <p className="font-sans text-sm text-body">
            This relationship is already linked to a different resident. Link to {pendingResident.name} instead?
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleLink(pendingResident, true)}
              disabled={isPending}
              className="rounded-md bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-navy/90 disabled:cursor-not-allowed"
            >
              Yes, Replace Link
            </button>
            <button
              type="button"
              onClick={() => setPendingResident(null)}
              className="font-sans text-sm text-muted hover:text-body"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 font-sans text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={() => {
          setIsSearching(false);
          setQuery("");
          setResults([]);
          setError(null);
        }}
        className="mt-2 font-sans text-sm text-muted hover:text-body"
      >
        Cancel
      </button>
    </div>
  );
}

export function RelationshipOverview({
  relationship,
  linkedResidentName,
}: {
  relationship: Relationship;
  linkedResidentName: string | null;
}) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-4 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Overview
      </h3>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Type</p>
          <p className="mt-0.5 font-sans text-sm text-body">
            {RELATIONSHIP_TYPE_LABELS[relationship.relationship_type]}
          </p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Stage</p>
          <div className="mt-0.5">
            <StageChanger relationship={relationship} />
          </div>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Owner</p>
          <p className="mt-0.5 font-sans text-sm text-body">{relationship.owner_label ?? "Unassigned"}</p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Priority</p>
          <p className="mt-0.5 font-sans text-sm text-body">
            {RELATIONSHIP_PRIORITY_LABELS[relationship.priority]}
          </p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Linked Resident
          </p>
          <div className="mt-0.5">
            <LinkResident relationship={relationship} linkedResidentName={linkedResidentName} />
          </div>
        </div>
        {(relationship.prospective_client_first_name || relationship.prospective_client_last_name) && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Prospective Client
            </p>
            <p className="mt-0.5 font-sans text-sm text-body">
              {[relationship.prospective_client_first_name, relationship.prospective_client_last_name]
                .filter(Boolean)
                .join(" ") || "-"}
              {relationship.prospective_client_preferred_name
                ? ` "${relationship.prospective_client_preferred_name}"`
                : ""}
            </p>
          </div>
        )}
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Primary Contact
            {relationship.primary_contact_is_prospective_client && (
              <span className="ml-1 normal-case text-subtle">(is the prospective client)</span>
            )}
          </p>
          <p className="mt-0.5 font-sans text-sm text-body">
            {relationship.primary_contact_name ?? "-"}
            {relationship.primary_contact_relationship &&
            !relationship.primary_contact_is_prospective_client
              ? ` (${relationship.primary_contact_relationship})`
              : ""}
          </p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Source</p>
          <p className="mt-0.5 font-sans text-sm text-body">{relationship.source_label ?? "-"}</p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Last Meaningful Touch
          </p>
          <p className="mt-0.5 font-sans text-sm text-body">
            {compactDate(relationship.last_meaningful_touch_at)}
          </p>
        </div>
      </div>

      {relationship.summary && (
        <div className="mt-4 border-t border-ivory-border pt-4">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Summary</p>
          <p className="mt-0.5 font-sans text-sm text-body">{relationship.summary}</p>
        </div>
      )}
    </div>
  );
}
