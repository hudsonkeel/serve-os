"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  RELATIONSHIP_ATTENTION_LABELS,
  RelationshipAttentionStatus,
} from "@/lib/relationships/attention";
import {
  RELATIONSHIP_TYPE_LABELS,
  RELATIONSHIP_STAGE_LABELS,
} from "@/lib/relationships/constants";
import {
  filterByRelationshipFilter,
  matchesRelationshipSearch,
  normalizeSearchQuery,
  RELATIONSHIP_FILTER_OPTIONS,
  RelationshipFilterValue,
  RelationshipWorkspaceRow,
} from "@/lib/relationships/search";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { AddExternalProspectForm } from "./AddExternalProspectForm";

export interface RelationshipTableRow extends RelationshipWorkspaceRow {
  nearestActionTitle: string | null;
  nearestActionDueAt: string | null;
  attentionStatus: RelationshipAttentionStatus;
}

function compactDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ATTENTION_BADGE_TONE: Record<RelationshipAttentionStatus, "danger" | "warning" | "gold" | "neutral"> = {
  overdue: "danger",
  due_today: "warning",
  due_this_week: "gold",
  upcoming: "neutral",
  no_next_action: "warning",
  on_hold: "neutral",
  closed: "neutral",
};

interface RelationshipsWorkspaceProps {
  rows: RelationshipTableRow[];
}

export function RelationshipsWorkspace({ rows }: RelationshipsWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RelationshipFilterValue>("all");
  const [attentionFilter, setAttentionFilter] = useState<RelationshipAttentionStatus | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const trimmedQuery = normalizeSearchQuery(search);
  const hasActiveSearch = trimmedQuery.length > 0;

  const attentionCounts = useMemo(() => {
    const counts: Record<RelationshipAttentionStatus, number> = {
      overdue: 0,
      due_today: 0,
      due_this_week: 0,
      upcoming: 0,
      no_next_action: 0,
      on_hold: 0,
      closed: 0,
    };
    for (const row of rows) counts[row.attentionStatus] += 1;
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = filterByRelationshipFilter(rows, filter);
    if (attentionFilter) {
      result = result.filter((r) => r.attentionStatus === attentionFilter);
    }
    if (hasActiveSearch) {
      result = result.filter((r) => matchesRelationshipSearch(r, trimmedQuery));
    }
    return result;
  }, [rows, filter, attentionFilter, hasActiveSearch, trimmedQuery]);

  return (
    <div className="space-y-5">
      {/* Attention summary */}
      <div className="flex flex-wrap items-center gap-2">
        {(["overdue", "due_today", "due_this_week", "no_next_action"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setAttentionFilter(attentionFilter === status ? null : status)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-sans text-sm font-medium transition-colors ${
              attentionFilter === status
                ? "border-navy bg-navy text-white"
                : "border-ivory-border bg-surface text-body hover:border-navy/20 hover:bg-ivory-warm"
            }`}
          >
            {RELATIONSHIP_ATTENTION_LABELS[status]}
            <span
              className={`rounded-full px-2 py-0.5 font-sans text-label font-semibold leading-none ${
                attentionFilter === status ? "bg-white/20 text-white" : "bg-ivory-warm text-muted"
              }`}
            >
              {attentionCounts[status]}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by relationship, resident, or contact..."
            aria-label="Search relationships"
            className="h-12 w-full rounded-lg border border-ivory-border bg-surface px-4 font-sans text-base text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsAdding((v) => !v)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90"
        >
          {isAdding ? "Close" : "+ Add External Prospect"}
        </button>
      </div>

      {isAdding && <AddExternalProspectForm onDone={() => setIsAdding(false)} />}

      {/* Type/status tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-ivory-border">
        {RELATIONSHIP_FILTER_OPTIONS.map((opt) => {
          const isActive = filter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors ${
                isActive
                  ? "border-b-navy text-navy"
                  : "border-b-transparent text-muted hover:text-body"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {hasActiveSearch && (
        <p role="status" aria-live="polite" className="font-sans text-sm font-medium text-muted">
          {filteredRows.length === 0
            ? "No relationships found"
            : `${filteredRows.length} relationship${filteredRows.length === 1 ? "" : "s"} found`}
        </p>
      )}

      {/* Table */}
      {filteredRows.length === 0 ? (
        <EmptyState
          title={hasActiveSearch ? "No relationships found" : undefined}
          description={
            hasActiveSearch
              ? `No relationships match "${search.trim()}." Try checking the spelling or searching by resident, contact, or organization name.`
              : "No relationships in this view yet."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ivory-border bg-surface shadow-card">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-ivory-border text-left">
                {["Relationship", "Type", "Resident", "Stage", "Next Action", "Due", "Owner", "Status"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ivory-border">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-ivory-warm/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/relationships/${row.id}`}
                      className="font-sans text-sm font-semibold text-navy hover:text-navy-light"
                    >
                      {row.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-sans text-sm text-body">
                    {RELATIONSHIP_TYPE_LABELS[row.relationshipType]}
                  </td>
                  <td className="px-4 py-3 font-sans text-sm text-body">
                    {row.residentId ? (
                      <Link
                        href={`/residents/${row.residentId}`}
                        className="text-navy hover:text-navy-light"
                      >
                        {row.residentName ?? "View resident"}
                      </Link>
                    ) : (
                      <span className="text-subtle">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-sans text-sm text-body">
                    {RELATIONSHIP_STAGE_LABELS[row.stage]}
                  </td>
                  <td className="px-4 py-3 font-sans text-sm text-body">
                    {row.nearestActionTitle ?? <span className="text-subtle">-</span>}
                  </td>
                  <td className="px-4 py-3 font-sans text-sm text-body">
                    {compactDate(row.nearestActionDueAt)}
                  </td>
                  <td className="px-4 py-3 font-sans text-sm text-body">
                    {row.ownerLabel ?? <span className="text-subtle">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ATTENTION_BADGE_TONE[row.attentionStatus]}>
                      {RELATIONSHIP_ATTENTION_LABELS[row.attentionStatus]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
