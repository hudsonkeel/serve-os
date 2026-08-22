"use client";

// Community Roster Import + Reconciliation phase, Pass 2 — the one
// per-row review control, covering every resolution_status the
// orchestration layer can produce. Visually mirrors
// components/reconciliation/MatchToExistingPersonControl.tsx +
// CreateNewResidentControl.tsx, calling the roster-specific actions
// instead. Nothing here ever auto-resolves anything — every path ends at
// an explicit human click, same discipline as the AxisCare controls this
// mirrors.
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  confirmCommunityRosterMatch,
  rejectCommunityRosterMatch,
  deferCommunityRosterMatch,
  markCommunityRosterRowInvalid,
  createResidentFromRosterRow,
} from "@/lib/actions/communityRosterImport";
import { searchResidentsForLinking } from "@/lib/actions/relationships";
import type { ResidentSearchResult } from "@/lib/data/relationships";
import { Badge } from "@/components/ui/Badge";

export interface RosterRowReviewProps {
  runId: string;
  communityId: string;
  communityName: string;
  sourceRowId: string;
  sourceRecordId: string;
  displayLabel: string;
  firstNameRaw: string;
  lastNameRaw: string;
  resolutionStatus: string;
  suggestedResidentId: string | null;
  suggestedResidentName: string | null;
  matchBasis: "roster_tier" | "canonical_signal" | "cross_community";
  reason: string | null;
}

type Mode = "idle" | "searching" | "creating";

const NEEDS_REVIEW_HINT: Record<string, string> = {
  ambiguous: "Multiple possible matches — search to pick the correct person, or create a new resident if none of them are right.",
  possible_duplicate: "This apartment appears more than once in the file — search to confirm, or create a new resident.",
  new_resident: "No existing Serve resident matched this row.",
  possible_match: "A possible match was found — not from the roster's own apartment/name check, but from Serve's broader identity signals.",
};

const SUGGESTION_LABELS: Record<string, string> = {
  possible_match: "Possible match",
  possible_cross_community_match: "Possible move — lives in another community",
  contradicted_match: "Suggested match — evidence conflicts",
};

export function RosterRowReview({
  runId,
  communityId,
  communityName,
  sourceRowId,
  sourceRecordId,
  displayLabel,
  firstNameRaw,
  lastNameRaw,
  resolutionStatus,
  suggestedResidentId,
  suggestedResidentName,
  matchBasis,
  reason,
}: RosterRowReviewProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [firstName, setFirstName] = useState(firstNameRaw);
  const [lastName, setLastName] = useState(lastNameRaw);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [lastCreatedResidentId, setLastCreatedResidentId] = useState<string | null>(null);

  const identityInput = { runId, sourceRowId, sourceRecordId, vendorDisplayName: displayLabel, matchBasis };

  function confirm(residentId: string, residentName: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmCommunityRosterMatch({ ...identityInput, residentId });
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: `Confirmed to ${residentName}.` });
      setMode("idle");
    });
  }

  function reject() {
    if (!suggestedResidentId) return;
    const rationale = window.prompt("Why isn't this the same person? (required)");
    if (!rationale?.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const result = await rejectCommunityRosterMatch({ ...identityInput, residentId: suggestedResidentId }, rationale);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: "Recorded — not the same person." });
      setMode("searching");
    });
  }

  function defer() {
    const rationale = window.prompt("Why defer this row? (required)");
    if (!rationale?.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const result = suggestedResidentId
        ? await deferCommunityRosterMatch({ ...identityInput, residentId: suggestedResidentId }, rationale)
        : await deferCommunityRosterMatch({ runId, sourceRowId, sourceRecordId, vendorDisplayName: displayLabel }, rationale);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: "Deferred — you can come back to this row later." });
    });
  }

  function markInvalid() {
    const reasonText = window.prompt("Why is this row invalid? (required)");
    if (!reasonText?.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const result = await markCommunityRosterRowInvalid({ runId, sourceRowId }, reasonText);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: "Marked invalid." });
    });
  }

  async function handleSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const found = await searchResidentsForLinking(value, { communityId });
    setResults(found);
    setIsSearching(false);
  }

  function submitCreate() {
    setMessage(null);
    startTransition(async () => {
      const outcome = await createResidentFromRosterRow({
        runId,
        sourceRowId,
        sourceRecordId,
        vendorDisplayName: displayLabel,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (outcome.error || !outcome.residentId) {
        setMessage({ type: "error", text: outcome.error ?? "Could not create a resident." });
        return;
      }
      setMode("idle");
      setResults([]);
      setLastCreatedResidentId(outcome.residentId);
    });
  }

  if (lastCreatedResidentId) {
    return (
      <p className="font-sans text-sm text-success-text">
        <Badge tone="success">Resident Created</Badge>{" "}
        <Link href={`/residents/${lastCreatedResidentId}`} className="font-medium text-navy hover:text-navy-light">
          View resident →
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {suggestedResidentId && suggestedResidentName && mode === "idle" && (
        <div
          className={`rounded-lg border px-3 py-2 ${
            resolutionStatus === "contradicted_match" ? "border-warning-text/40 bg-warning-surface" : "border-navy/20 bg-ivory-warm"
          }`}
        >
          <p
            className={`font-sans text-xs font-semibold uppercase tracking-widest ${
              resolutionStatus === "contradicted_match" ? "text-warning-text" : "text-subtle"
            }`}
          >
            {SUGGESTION_LABELS[resolutionStatus] ?? "Suggested match"}
          </p>
          <p className="mt-0.5 font-sans text-sm text-body">{suggestedResidentName}</p>
          {reason && <p className="mt-0.5 font-sans text-xs text-muted">{reason}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => confirm(suggestedResidentId, suggestedResidentName)}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {isPending ? "Working…" : resolutionStatus === "contradicted_match" ? "Confirm Anyway" : "Confirm Match"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={reject}
              className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body hover:bg-ivory disabled:opacity-50"
            >
              Not This Person
            </button>
            <button
              type="button"
              onClick={() => setMode("searching")}
              className="font-sans text-xs font-medium text-navy hover:text-navy-light"
            >
              Search Someone Else
            </button>
          </div>
        </div>
      )}

      {!suggestedResidentId && mode === "idle" && (
        <div className="space-y-1.5">
          {reason || NEEDS_REVIEW_HINT[resolutionStatus] ? (
            <p className="font-sans text-xs text-muted">{reason || NEEDS_REVIEW_HINT[resolutionStatus]}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("searching")}
              className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body hover:bg-ivory"
            >
              Match to Existing Person
            </button>
            <button
              type="button"
              onClick={() => setMode("creating")}
              className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body hover:bg-ivory"
            >
              Create New Resident
            </button>
          </div>
        </div>
      )}

      {mode === "searching" && (
        <div className="space-y-2 rounded-lg border border-ivory-border bg-ivory p-3">
          <p className="font-sans text-sm font-medium text-body">Search {communityName} for the correct resident</p>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Name or unit number…"
            autoFocus
            className="w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
          {isSearching && <p className="font-sans text-xs text-muted">Searching…</p>}
          {results.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => confirm(r.id, r.name)}
                  className="block w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 text-left font-sans text-sm text-body hover:border-navy/30 hover:bg-ivory-warm disabled:opacity-50"
                >
                  {r.name}
                  {r.unitNumber ? ` · Unit ${r.unitNumber}` : ""}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setMode("idle")} className="font-sans text-xs text-muted hover:text-body">
            Cancel
          </button>
        </div>
      )}

      {mode === "creating" && (
        <div className="space-y-2 rounded-lg border border-ivory-border bg-ivory p-3">
          <p className="font-sans text-sm font-medium text-body">
            Create a new resident in <span className="font-semibold">{communityName}</span>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="w-1/2 rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="w-1/2 rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || !firstName.trim() || !lastName.trim()}
              onClick={submitCreate}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {isPending ? "Creating…" : "Create Resident"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setMode("idle")}
              className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div className="flex gap-3 pt-0.5">
          <button type="button" disabled={isPending} onClick={defer} className="font-sans text-xs font-medium text-muted hover:text-body disabled:opacity-50">
            Defer
          </button>
          <button type="button" disabled={isPending} onClick={markInvalid} className="font-sans text-xs font-medium text-muted hover:text-body disabled:opacity-50">
            Mark Invalid
          </button>
        </div>
      )}

      {message?.type === "success" && <p className="font-sans text-xs text-success-text">{message.text}</p>}
      {message?.type === "error" && <p className="font-sans text-xs text-danger-text">{message.text}</p>}
    </div>
  );
}
