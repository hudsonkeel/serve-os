"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ResidentComparisonRecord } from "@/lib/data/residentIdentity";

interface EvidenceEntry {
  signalType: string;
  residentIdA: string;
  residentIdB: string;
  description: string;
  strength: "strong" | "contextual" | "negative";
}

interface CandidateRow {
  id: string;
  status: string;
  confidence_band: "high" | "probable" | "needs_investigation";
  evidence: EvidenceEntry[];
  created_at: string;
  resolved_at: string | null;
  resolution_rationale: string | null;
}

interface ResidentIdentityQueueProps {
  candidates: CandidateRow[];
  residentsById: Record<string, ResidentComparisonRecord>;
}

const CONFIDENCE_LABELS: Record<CandidateRow["confidence_band"], string> = {
  high: "High Confidence",
  probable: "Probable",
  needs_investigation: "Needs Investigation",
};

const CONFIDENCE_TONE: Record<CandidateRow["confidence_band"], "danger" | "warning" | "neutral"> = {
  high: "danger",
  probable: "warning",
  needs_investigation: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved_merged: "Merged",
  resolved_not_duplicate: "Not a Duplicate",
  resolved_profile_corrected: "Profile Corrected",
  dismissed_bad_candidate: "Dismissed",
};

type FilterTab = "open" | "high" | "probable" | "needs_investigation" | "resolved" | "all";

function residentLabel(resident: ResidentComparisonRecord | undefined): string {
  if (!resident) return "Unknown resident";
  const name = [resident.firstName, resident.lastName].filter(Boolean).join(" ") || resident.displayName || "Unnamed";
  return resident.unitNumber ? `${name} — Unit ${resident.unitNumber}` : name;
}

export function ResidentIdentityQueue({ candidates, residentsById }: ResidentIdentityQueueProps) {
  const [tab, setTab] = useState<FilterTab>("open");

  const filtered = useMemo(() => {
    switch (tab) {
      case "open":
        return candidates.filter((c) => c.status === "open" || c.status === "investigating");
      case "high":
        return candidates.filter((c) => c.confidence_band === "high" && (c.status === "open" || c.status === "investigating"));
      case "probable":
        return candidates.filter((c) => c.confidence_band === "probable" && (c.status === "open" || c.status === "investigating"));
      case "needs_investigation":
        return candidates.filter((c) => c.confidence_band === "needs_investigation" && (c.status === "open" || c.status === "investigating"));
      case "resolved":
        return candidates.filter((c) => !["open", "investigating"].includes(c.status));
      case "all":
      default:
        return candidates;
    }
  }, [candidates, tab]);

  const tabs: { value: FilterTab; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "high", label: "High Confidence" },
    { value: "probable", label: "Probable" },
    { value: "needs_investigation", label: "Needs Investigation" },
    { value: "resolved", label: "Resolved" },
    { value: "all", label: "All" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-ivory-border pb-3">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors ${
              tab === t.value ? "bg-navy text-white" : "bg-ivory-warm text-muted hover:bg-ivory-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState description="No candidates in this view." />
      ) : (
        <div className="space-y-3">
          {filtered.map((candidate) => {
            const first = candidate.evidence[0];
            const residentA = first ? residentsById[first.residentIdA] : undefined;
            const residentB = first ? residentsById[first.residentIdB] : undefined;
            const strengthRank: Record<EvidenceEntry["strength"], number> = { strong: 0, contextual: 1, negative: 2 };
            const topEvidence = [...candidate.evidence].sort((a, b) => strengthRank[a.strength] - strengthRank[b.strength])[0];

            return (
              <Link
                key={candidate.id}
                href={`/resident-identities/${candidate.id}`}
                className="block rounded-lg border border-ivory-border bg-ivory px-5 py-4 transition-colors hover:border-navy/30"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone={CONFIDENCE_TONE[candidate.confidence_band]}>{CONFIDENCE_LABELS[candidate.confidence_band]}</Badge>
                  <Badge tone="neutral">{STATUS_LABELS[candidate.status] ?? candidate.status}</Badge>
                  <span className="font-sans text-sm text-subtle">
                    {new Date(candidate.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <p className="font-sans text-base font-semibold text-body">
                  {residentLabel(residentA)} <span className="text-subtle">vs.</span> {residentLabel(residentB)}
                </p>
                {topEvidence && <p className="mt-1 font-sans text-sm text-muted">{topEvidence.description}</p>}
                {candidate.evidence.length > 1 && (
                  <p className="mt-1 font-sans text-xs text-subtle">+{candidate.evidence.length - 1} more piece(s) of evidence</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
