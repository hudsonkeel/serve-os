"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RELATIONSHIP_STAGE_LABELS } from "@/lib/relationships/constants";
import type { RelationshipBoardRow } from "@/lib/data/relationships";
import type { PipelineStage } from "@/lib/supabase/types";

const STAGE_ORDER: readonly PipelineStage[] = [
  "new_inquiry",
  "contact_attempted",
  "connected",
  "discovery",
  "assessment_scheduled",
  "assessment_completed",
  "proposal_in_progress",
  "proposal_sent",
  "considering",
  "follow_up_needed",
  "ready_to_start",
  "on_hold",
  "won",
  "closed_lost",
];

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function prospectName(row: RelationshipBoardRow): string {
  return row.residentName || row.prospectiveClientName || row.prospectiveResidentName || row.displayName;
}

interface ProspectsBoardProps {
  rows: RelationshipBoardRow[];
}

export function ProspectsBoard({ rows }: ProspectsBoardProps) {
  const [search, setSearch] = useState("");
  const trimmedQuery = search.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!trimmedQuery) return rows;
    return rows.filter((row) => {
      const haystack = [prospectName(row), row.ownerLabel, row.communityName, row.organizationName, row.primaryContactName];
      return haystack.some((field) => field?.toLowerCase().includes(trimmedQuery));
    });
  }, [rows, trimmedQuery]);

  const grouped = useMemo(() => {
    const byStage = new Map<PipelineStage, RelationshipBoardRow[]>();
    for (const row of visible) {
      const existing = byStage.get(row.stage) ?? [];
      existing.push(row);
      byStage.set(row.stage, existing);
    }
    return STAGE_ORDER.map((stage) => ({ stage, rows: byStage.get(stage) ?? [] })).filter((g) => g.rows.length > 0);
  }, [visible]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prospects by name, owner, or community..."
          aria-label="Search prospects"
          className="h-12 w-full max-w-md rounded-lg border border-ivory-border bg-surface pl-11 pr-4 font-sans text-base text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
        />
      </div>

      {grouped.length > 0 ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.stage}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-sans text-base font-semibold text-body">{RELATIONSHIP_STAGE_LABELS[group.stage]}</h3>
                <span className="rounded-full bg-ivory-warm px-2.5 py-0.5 font-sans text-label font-semibold text-muted">
                  {group.rows.length}
                </span>
              </div>
              <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
                <div className="divide-y divide-ivory-border">
                  {group.rows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/relationships/${row.id}`}
                      className="block px-6 py-5 transition-colors hover:bg-ivory"
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone={row.relationshipType === "resident_prospect" ? "gold" : "blue"}>
                          {row.relationshipType === "resident_prospect" ? "Resident Prospect" : "External Prospect"}
                        </Badge>
                        {row.communityName && <span className="font-sans text-sm text-muted">{row.communityName}</span>}
                      </div>
                      <p className="font-sans text-card-title font-semibold text-body">{prospectName(row)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-sm text-muted">
                        <span>Owner: {row.ownerLabel ?? "Unassigned"}</span>
                        {row.nearestAction ? (
                          <span>
                            Next: {row.nearestAction.title}
                            {row.nearestAction.dueAt && ` · Due ${shortDate(row.nearestAction.dueAt)}`}
                          </span>
                        ) : (
                          <span>No next action set</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
          <div className="px-5 py-14">
            <EmptyState
              title={trimmedQuery ? "No prospects found" : undefined}
              description={trimmedQuery ? `No prospects match "${search.trim()}."` : "No prospects in this view."}
            />
          </div>
        </div>
      )}
    </div>
  );
}
