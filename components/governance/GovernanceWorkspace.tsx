"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { BadgeTone } from "@/components/ui/Badge";
import type { DecisionListRow } from "@/lib/data/decisionEngine";

// Deliberately simple — one native filter, one table. The objective this
// phase is proving the Decision Engine, not building the final Governance
// application. See docs/architecture/governance-phase-1-implementation.md.

const PRIORITY_TONE: Record<string, BadgeTone> = {
  routine: "neutral",
  monitor: "blue",
  important: "warning",
  urgent: "danger",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface GovernanceWorkspaceProps {
  rows: DecisionListRow[];
}

export function GovernanceWorkspace({ rows }: GovernanceWorkspaceProps) {
  const [recommendationTypeFilter, setRecommendationTypeFilter] = useState<string>("all");

  const recommendationTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.recommendationType))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    if (recommendationTypeFilter === "all") return rows;
    return rows.filter((r) => r.recommendationType === recommendationTypeFilter);
  }, [rows, recommendationTypeFilter]);

  if (rows.length === 0) {
    return (
      <EmptyState description="No governance decisions have been evaluated yet. Seed demonstration data or evaluate a decision to see it here." />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="governance-outcome-filter" className="font-sans text-sm font-medium text-muted">
          Outcome
        </label>
        <select
          id="governance-outcome-filter"
          value={recommendationTypeFilter}
          onChange={(e) => setRecommendationTypeFilter(e.target.value)}
          className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body"
        >
          <option value="all">All</option>
          {recommendationTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState description="No decisions match this filter." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-ivory-border bg-surface shadow-card">
          <table className="w-full text-left font-sans text-sm">
            <thead>
              <tr className="border-b border-ivory-border text-muted">
                <th className="px-5 py-3 font-medium">Subject</th>
                <th className="px-5 py-3 font-medium">Decision</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last evaluated</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-ivory-border last:border-0">
                  <td className="px-5 py-3">
                    <Link href={`/governance/${row.id}`} className="font-medium text-navy hover:text-navy-light">
                      {row.subjectType} — {row.subjectId}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-body">{row.title}</td>
                  <td className="px-5 py-3">
                    <Badge tone={PRIORITY_TONE[row.suggestedPriority] ?? "neutral"}>{row.suggestedPriority}</Badge>
                  </td>
                  <td className="px-5 py-3 text-body">{row.status}</td>
                  <td className="px-5 py-3 text-muted">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
