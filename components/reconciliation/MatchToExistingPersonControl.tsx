"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { confirmAxisCareResidentIdentity } from "@/lib/actions/reconciliation";
import { searchResidentsForLinking } from "@/lib/actions/relationships";
import type { ResidentSearchResult } from "@/lib/data/relationships";
import type { SuggestedResidentMatch } from "@/lib/integrations/axiscare/unmatchedClientCandidates";
import { Badge } from "@/components/ui/Badge";

// "Match to Existing Person" — the governed front door for an AxisCare
// record that's real but simply unlinked (identityStatus === "unmatched").
// Every path here ends at the exact same governed write
// confirmAxisCareResidentIdentity() already uses for deterministic
// candidate/needs-review matches — no second identity mechanism, no new
// table. matchBasis "manual_match" honestly records that a human, not the
// automated matcher, made this call; the post-confirmation AxisCare sync
// still fires automatically from that same action. Nothing here ever
// auto-confirms — every branch ends at an explicit human click.
interface MatchToExistingPersonControlProps {
  axiscareId: string;
  vendorDisplayName: string;
  statusLabel: string | null;
  statusActive: boolean;
  classes: string[];
  suggestedMatches: SuggestedResidentMatch[];
  // The record's own deterministically-resolved community (see
  // communityMapping.ts), when known — search defaults to exactly this
  // community, not whatever community the operator currently has
  // selected (Reconciliation is a deliberately unscoped, cross-community
  // page). Null only when the record's community is genuinely unresolved,
  // in which case there's nothing sensible to default to and search
  // falls back to cross-community, same as before this phase.
  resolvedCommunityId?: string | null;
  resolvedCommunityName?: string | null;
}

type Mode = "idle" | "searching" | "confirming";

export function MatchToExistingPersonControl({
  axiscareId,
  vendorDisplayName,
  statusLabel,
  statusActive,
  classes,
  suggestedMatches,
  resolvedCommunityId = null,
  resolvedCommunityName = null,
}: MatchToExistingPersonControlProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [pendingResident, setPendingResident] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Explicit opt-in only — defaults to the record's own resolved
  // community (section 10). Falls back to cross-community by default when
  // no community could be resolved for this record at all.
  const [searchOtherCommunities, setSearchOtherCommunities] = useState(resolvedCommunityId === null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const strongMatches = suggestedMatches.filter((m) => m.confidence === "strong");
  const leadMatch = strongMatches.length === 1 ? strongMatches[0] : null;
  // Everything else worth showing for a quick human glance — every
  // suggestion when there's no single clear leader, otherwise the
  // remaining ones. Capped: this is meant to be a fast decision, not a
  // full resident directory.
  const otherMatches = (leadMatch ? suggestedMatches.filter((m) => m.residentId !== leadMatch.residentId) : suggestedMatches).slice(0, 4);

  async function handleSearch(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    // Defaults to the record's own resolved community; cross-community
    // search is a deliberate, explicit opt-in for move/transfer cases
    // (AxisCare Reconciliation + Multi-Source Identity Ingestion phase,
    // section 10) — never silently guessing which community to search.
    const found =
      searchOtherCommunities || !resolvedCommunityId
        ? await searchResidentsForLinking(value, { crossCommunity: true })
        : await searchResidentsForLinking(value, { communityId: resolvedCommunityId });
    setResults(found);
    setIsSearching(false);
  }

  function confirm(residentId: string, residentName: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmAxisCareResidentIdentity({
        axiscareId,
        vendorDisplayName,
        matchBasis: "manual_match",
        residentId,
        statusLabel,
        statusActive,
        classes,
      });
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({
        type: "success",
        text: result.syncWarning ? `Confirmed to ${residentName}. ${result.syncWarning}` : `Confirmed to ${residentName}. AxisCare data synced.`,
      });
      setMode("idle");
      setPendingResident(null);
    });
  }

  if (mode === "searching") {
    return (
      <div className="space-y-2 rounded-lg border border-ivory-border bg-ivory p-3">
        <p className="font-sans text-sm font-medium text-body">Search for the correct Serve resident</p>
        {resolvedCommunityId && (
          <label className="flex items-center gap-2 font-sans text-xs text-muted">
            <input
              type="checkbox"
              checked={searchOtherCommunities}
              onChange={(e) => {
                setSearchOtherCommunities(e.target.checked);
                setResults([]);
                if (query.trim().length >= 2) handleSearch(query);
              }}
            />
            {searchOtherCommunities
              ? "Searching all communities"
              : `Searching ${resolvedCommunityName ?? "this record's community"} only`}
            {!searchOtherCommunities && " — check to search other communities"}
          </label>
        )}
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
                onClick={() => {
                  setPendingResident({ id: r.id, name: r.name });
                  setMode("confirming");
                }}
                className="block w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 text-left font-sans text-sm text-body hover:border-navy/30 hover:bg-ivory-warm"
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
    );
  }

  if (mode === "confirming" && pendingResident) {
    return (
      <div className="space-y-2 rounded-lg border border-ivory-border bg-ivory p-3">
        <p className="font-sans text-sm text-body">
          Confirm <span className="font-semibold">{vendorDisplayName}</span> (AxisCare #{axiscareId}) is{" "}
          <span className="font-semibold">{pendingResident.name}</span>?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => confirm(pendingResident.id, pendingResident.name)}
            className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
          >
            {isPending ? "Confirming…" : "Confirm Match"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setPendingResident(null);
              setMode("searching");
            }}
            className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
          >
            Back
          </button>
        </div>
        {message?.type === "error" && <p className="font-sans text-sm text-danger-text">{message.text}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leadMatch && (
        <div className="rounded-lg border border-navy/20 bg-ivory-warm px-3 py-2">
          <p className="font-sans text-xs font-semibold uppercase tracking-widest text-subtle">Likely match</p>
          <p className="mt-0.5 font-sans text-sm text-body">
            <span className="font-semibold">{leadMatch.displayName}</span>
            {leadMatch.unitNumber ? ` · Unit ${leadMatch.unitNumber}` : ""}
          </p>
          <p className="mt-0.5 font-sans text-xs text-muted">{leadMatch.reasons.join(" · ")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => confirm(leadMatch.residentId, leadMatch.displayName)}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
            >
              {isPending ? "Confirming…" : "Confirm Match"}
            </button>
            <button
              type="button"
              onClick={() => setMode("searching")}
              className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body hover:bg-ivory"
            >
              Choose Different Person
            </button>
          </div>
        </div>
      )}

      {!leadMatch && otherMatches.length > 0 && (
        <div className="rounded-lg border border-ivory-border bg-ivory px-3 py-2">
          <p className="font-sans text-xs font-semibold uppercase tracking-widest text-subtle">
            Possible matches — not enough evidence to lead with one
          </p>
          <div className="mt-1 space-y-1.5">
            {otherMatches.map((m) => (
              <div key={m.residentId} className="flex items-center justify-between gap-2 rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="font-sans text-sm text-body">
                    {m.displayName}
                    {m.unitNumber ? ` · Unit ${m.unitNumber}` : ""}
                  </p>
                  <p className="truncate font-sans text-xs text-muted">{m.reasons.join(" · ")}</p>
                </div>
                <Button type="button" size="small" disabled={isPending} onClick={() => confirm(m.residentId, m.displayName)}>
                  Confirm →
                </Button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setMode("searching")} className="mt-2 font-sans text-xs font-medium text-navy hover:text-navy-light">
            Search Another Person →
          </button>
        </div>
      )}

      {leadMatch && otherMatches.length > 0 && (
        <details className="rounded-lg border border-ivory-border bg-surface px-3 py-2">
          <summary className="cursor-pointer font-sans text-xs font-medium text-muted select-none">Other possible matches ({otherMatches.length})</summary>
          <div className="mt-1.5 space-y-1.5">
            {otherMatches.map((m) => (
              <div key={m.residentId} className="flex items-center justify-between gap-2 rounded-lg border border-ivory-border bg-ivory px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="font-sans text-sm text-body">
                    {m.displayName}
                    {m.unitNumber ? ` · Unit ${m.unitNumber}` : ""}
                  </p>
                  <p className="truncate font-sans text-xs text-muted">{m.reasons.join(" · ")}</p>
                </div>
                <Button type="button" size="small" disabled={isPending} onClick={() => confirm(m.residentId, m.displayName)}>
                  Confirm →
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}

      {suggestedMatches.length === 0 && (
        <button
          type="button"
          onClick={() => setMode("searching")}
          className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body hover:bg-ivory"
        >
          Match to Existing Person
        </button>
      )}

      {message?.type === "success" && (
        <p className="font-sans text-sm text-success-text">
          <Badge tone="success">Confirmed</Badge> {message.text}
        </p>
      )}
      {message?.type === "error" && <p className="font-sans text-sm text-danger-text">{message.text}</p>}
    </div>
  );
}
