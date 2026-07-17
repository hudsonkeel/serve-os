"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  checkForActiveResidentProspect,
  createRelationship,
  searchResidentsForLinking,
} from "@/lib/actions/relationships";
import {
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_ACTION_TYPES,
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_STAGES,
} from "@/lib/relationships/constants";
import type { ResidentSearchResult } from "@/lib/data/relationships";
import type { PipelineStage, Relationship, RelationshipActionType, RelationshipPriority } from "@/lib/supabase/types";

interface AddResidentProspectFormProps {
  onDone: () => void;
}

type Step = "search" | "duplicate" | "details";

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";
const labelClassName =
  "mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle";

// Step 1: search and select an existing Resident → Step 2 (only if an
// active Resident Prospect Relationship already exists for them): offer
// to open/reuse it rather than silently creating a duplicate → Step 3:
// capture the new Relationship's details. See docs/design/RELATIONSHIPS.md,
// "A prospect is a Relationship type, not a Resident classification."
export function AddResidentProspectForm({ onDone }: AddResidentProspectFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("search");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResident, setSelectedResident] = useState<ResidentSearchResult | null>(null);
  const [existingRelationship, setExistingRelationship] = useState<Relationship | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [stage, setStage] = useState<PipelineStage>("new_inquiry");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [priority, setPriority] = useState<RelationshipPriority>("normal");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactRelationship, setPrimaryContactRelationship] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [summary, setSummary] = useState("");
  const [firstActionTitle, setFirstActionTitle] = useState("");
  const [firstActionType, setFirstActionType] = useState<RelationshipActionType>("call");
  const [firstActionDueAt, setFirstActionDueAt] = useState("");
  const [workingNoteContent, setWorkingNoteContent] = useState("");

  async function handleSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const found = await searchResidentsForLinking(value);
    setResults(found);
    setIsSearching(false);
  }

  function handleSelectResident(resident: ResidentSearchResult) {
    setError(null);
    setSelectedResident(resident);
    setDisplayName(`${resident.name} — Prospect`);
    startTransition(async () => {
      const check = await checkForActiveResidentProspect(resident.id);
      if (check.existing) {
        setExistingRelationship(check.existing);
        setStep("duplicate");
      } else {
        setStep("details");
      }
    });
  }

  function handleCreateAnother() {
    setExistingRelationship(null);
    setStep("details");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedResident) return;
    setError(null);

    startTransition(async () => {
      const result = await createRelationship({
        relationshipType: "resident_prospect",
        stage,
        displayName,
        residentId: selectedResident.id,
        primaryContactName,
        primaryContactRelationship,
        primaryContactPhone,
        primaryContactEmail,
        summary,
        ownerLabel,
        priority,
        sourceType: "manual",
        sourceLabel,
        firstActionTitle,
        firstActionType,
        firstActionDueAt,
        workingNoteContent,
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
    <div className="space-y-4 rounded-xl border border-ivory-border bg-ivory p-6">
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Add Resident Prospect
      </p>
      <p className="-mt-2 font-sans text-sm text-subtle">
        For a sales opportunity involving an existing resident.
      </p>

      {step === "search" && (
        <div className="space-y-3">
          <label className="block">
            <span className={labelClassName}>Search Residents</span>
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by resident name or apartment..."
              className={fieldClassName}
              autoFocus
            />
          </label>
          {isSearching && <p className="font-sans text-sm text-subtle">Searching...</p>}
          {results.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-ivory-border bg-surface">
              {results.map((resident) => (
                <li key={resident.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectResident(resident)}
                    disabled={isPending}
                    className="w-full px-3 py-2 text-left font-sans text-sm text-body hover:bg-ivory-warm disabled:cursor-not-allowed"
                  >
                    {resident.name}
                    {resident.unitNumber ? ` — Unit ${resident.unitNumber}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && !isSearching && results.length === 0 && (
            <p className="font-sans text-sm text-subtle">No residents match &quot;{query.trim()}.&quot;</p>
          )}
          <button
            type="button"
            onClick={onDone}
            className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            Cancel
          </button>
        </div>
      )}

      {step === "duplicate" && selectedResident && existingRelationship && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-warning-surface px-4 py-4">
          <p className="font-sans text-sm font-semibold text-body">
            An active prospect Relationship already exists for {selectedResident.name}.
          </p>
          <p className="font-sans text-sm text-body">
            {existingRelationship.display_name} · {RELATIONSHIP_STAGE_LABELS[existingRelationship.stage]}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/relationships/${existingRelationship.id}`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-navy px-4 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90"
            >
              Open Relationship
            </Link>
            <button
              type="button"
              onClick={onDone}
              className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateAnother}
              className="font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
            >
              Create Another Relationship
            </button>
          </div>
        </div>
      )}

      {step === "details" && selectedResident && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="font-sans text-sm text-subtle">
            Resident: <span className="font-semibold text-body">{selectedResident.name}</span>
            {selectedResident.unitNumber ? ` — Unit ${selectedResident.unitNumber}` : ""}
            {" · "}
            <button
              type="button"
              onClick={() => {
                setSelectedResident(null);
                setStep("search");
              }}
              className="font-medium text-navy hover:text-navy-light"
            >
              Change
            </button>
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClassName}>Relationship Name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={fieldClassName}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Initial Stage</span>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as PipelineStage)}
                className={fieldClassName}
              >
                {RELATIONSHIP_STAGES.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_STAGE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={labelClassName}>Owner (optional)</span>
              <input
                type="text"
                value={ownerLabel}
                onChange={(e) => setOwnerLabel(e.target.value)}
                placeholder="e.g. Brian — leave blank for Unassigned"
                className={fieldClassName}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Opportunity Source</span>
              <input
                type="text"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="Resident requested info, family contacted Serve, Watermere referral..."
                className={fieldClassName}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Primary Contact Name</span>
              <input
                type="text"
                value={primaryContactName}
                onChange={(e) => setPrimaryContactName(e.target.value)}
                placeholder="Jennifer Smith"
                className={fieldClassName}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Relationship to Resident</span>
              <input
                type="text"
                value={primaryContactRelationship}
                onChange={(e) => setPrimaryContactRelationship(e.target.value)}
                placeholder="Daughter"
                className={fieldClassName}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Contact Phone</span>
              <input
                type="tel"
                value={primaryContactPhone}
                onChange={(e) => setPrimaryContactPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className={fieldClassName}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Contact Email</span>
              <input
                type="email"
                value={primaryContactEmail}
                onChange={(e) => setPrimaryContactEmail(e.target.value)}
                placeholder="name@example.com"
                className={fieldClassName}
              />
            </label>

            <label className="block">
              <span className={labelClassName}>Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as RelationshipPriority)}
                className={fieldClassName}
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
            <span className={labelClassName}>Summary (optional)</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              className={fieldClassName}
            />
          </label>

          <label className="block">
            <span className={labelClassName}>Working Note (optional)</span>
            <textarea
              value={workingNoteContent}
              onChange={(e) => setWorkingNoteContent(e.target.value)}
              rows={2}
              placeholder="Temporary context to help move this forward..."
              className={fieldClassName}
            />
          </label>

          <div className="rounded-lg border border-ivory-border bg-surface px-4 py-3">
            <p className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Next Action
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block sm:col-span-1">
                <span className={labelClassName}>What&apos;s next</span>
                <input
                  type="text"
                  value={firstActionTitle}
                  onChange={(e) => setFirstActionTitle(e.target.value)}
                  placeholder="Call Jennifer"
                  className={fieldClassName}
                />
              </label>
              <label className="block">
                <span className={labelClassName}>Type</span>
                <select
                  value={firstActionType}
                  onChange={(e) => setFirstActionType(e.target.value as RelationshipActionType)}
                  className={fieldClassName}
                >
                  {RELATIONSHIP_ACTION_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {RELATIONSHIP_ACTION_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClassName}>Due</span>
                <input
                  type="date"
                  value={firstActionDueAt}
                  onChange={(e) => setFirstActionDueAt(e.target.value)}
                  className={fieldClassName}
                />
              </label>
            </div>
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
              {isPending ? "Saving..." : "Create Relationship"}
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
      )}
    </div>
  );
}
