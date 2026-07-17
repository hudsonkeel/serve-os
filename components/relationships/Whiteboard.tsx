"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  RELATIONSHIP_ATTENTION_BADGE_TONE,
  RELATIONSHIP_ATTENTION_LABELS,
  RelationshipAttentionStatus,
} from "@/lib/relationships/attention";
import {
  applyBoardFilters,
  DEFAULT_BOARD_FILTERS,
  type BoardFilterState,
} from "@/lib/relationships/boardFilters";
import {
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_TYPE_LABELS,
} from "@/lib/relationships/constants";
import {
  getProspectOrResidentLabel,
  matchesRelationshipSearch,
  normalizeSearchQuery,
} from "@/lib/relationships/search";
import { sortWhiteboardRows, type SortableRelationshipRow } from "@/lib/relationships/sorting";
import type { RelationshipBoardRow } from "@/lib/data/relationships";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelationshipFilterBar } from "./RelationshipFilterBar";
import {
  QuickAddActionForm,
  QuickEditActionForm,
  QuickLogTouchForm,
  QuickOwnerPriorityForm,
  QuickServiceOpportunityForm,
  QuickStageForm,
  QuickWorkingNoteForm,
} from "./RelationshipQuickForms";

export interface WhiteboardRow extends RelationshipBoardRow, SortableRelationshipRow {
  attentionStatus: RelationshipAttentionStatus;
}

function compactDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type EditPanel = "stage" | "ownerPriority" | "action" | "touch" | "note" | "service";

function WhiteboardEditPanel({ row }: { row: WhiteboardRow }) {
  const [panel, setPanel] = useState<EditPanel | null>(null);

  const tabs: { key: EditPanel; label: string }[] = [
    { key: "stage", label: "Stage" },
    { key: "ownerPriority", label: "Owner / Priority" },
    { key: "action", label: "Next Action" },
    { key: "touch", label: "Log Touch" },
    { key: "note", label: "Working Note" },
    { key: "service", label: "Service Opportunity" },
  ];

  return (
    <div className="space-y-3 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setPanel(panel === tab.key ? null : tab.key)}
            className={`rounded-md px-3 py-1.5 font-sans text-sm font-medium transition-colors ${
              panel === tab.key ? "bg-navy text-white" : "border border-ivory-border bg-surface text-body hover:border-navy/20"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {panel === "stage" && (
        <QuickStageForm relationshipId={row.id} currentStage={row.stage} onDone={() => setPanel(null)} />
      )}
      {panel === "ownerPriority" && (
        <QuickOwnerPriorityForm
          relationshipId={row.id}
          currentOwnerLabel={row.ownerLabel}
          currentPriority={row.priority}
          onDone={() => setPanel(null)}
        />
      )}
      {panel === "action" &&
        (row.nearestAction ? (
          <QuickEditActionForm relationshipId={row.id} action={row.nearestAction} onDone={() => setPanel(null)} />
        ) : (
          <QuickAddActionForm relationshipId={row.id} onDone={() => setPanel(null)} />
        ))}
      {panel === "touch" && <QuickLogTouchForm relationshipId={row.id} onDone={() => setPanel(null)} />}
      {panel === "note" && <QuickWorkingNoteForm relationshipId={row.id} onDone={() => setPanel(null)} />}
      {panel === "service" && (
        <QuickServiceOpportunityForm
          relationshipId={row.id}
          current={row.serviceOpportunity}
          onDone={() => setPanel(null)}
        />
      )}
    </div>
  );
}

interface WhiteboardProps {
  rows: WhiteboardRow[];
}

const COLUMN_COUNT = 13;

export function Whiteboard({ rows }: WhiteboardProps) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<BoardFilterState>(DEFAULT_BOARD_FILTERS);
  const [attentionFilter, setAttentionFilter] = useState<RelationshipAttentionStatus | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const trimmedQuery = normalizeSearchQuery(search);
  const hasActiveSearch = trimmedQuery.length > 0;

  const attentionCounts = useMemo(() => {
    const counts: Partial<Record<RelationshipAttentionStatus, number>> = {};
    for (const row of rows) counts[row.attentionStatus] = (counts[row.attentionStatus] ?? 0) + 1;
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = applyBoardFilters(rows, filters);
    if (attentionFilter) {
      result = result.filter((r) => r.attentionStatus === attentionFilter);
    }
    if (hasActiveSearch) {
      result = result.filter((r) => matchesRelationshipSearch(r, trimmedQuery));
    }
    return sortWhiteboardRows(result);
  }, [rows, filters, attentionFilter, hasActiveSearch, trimmedQuery]);

  const hasAnyFilter =
    hasActiveSearch ||
    attentionFilter !== null ||
    filters.relationshipType !== DEFAULT_BOARD_FILTERS.relationshipType ||
    filters.stage !== DEFAULT_BOARD_FILTERS.stage ||
    filters.ownerLabel !== DEFAULT_BOARD_FILTERS.ownerLabel ||
    filters.communityName !== DEFAULT_BOARD_FILTERS.communityName ||
    filters.priority !== DEFAULT_BOARD_FILTERS.priority ||
    filters.residentLink !== DEFAULT_BOARD_FILTERS.residentLink ||
    filters.status !== DEFAULT_BOARD_FILTERS.status;

  return (
    <div className="space-y-5">
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
              {attentionCounts[status] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by relationship, resident, or contact..."
          aria-label="Search relationships"
          className="h-11 w-full max-w-md rounded-lg border border-ivory-border bg-surface px-4 font-sans text-base text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
        />
      </div>

      <RelationshipFilterBar rows={rows} filters={filters} onChange={setFilters} showStatusFilter />

      {hasActiveSearch && (
        <p role="status" aria-live="polite" className="font-sans text-sm font-medium text-muted">
          {filteredRows.length === 0
            ? "No relationships found"
            : `${filteredRows.length} relationship${filteredRows.length === 1 ? "" : "s"} found`}
        </p>
      )}

      {filteredRows.length === 0 ? (
        <EmptyState
          title="No relationships found"
          description={
            hasAnyFilter
              ? "No relationships match the current search or filters."
              : "No relationships yet."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ivory-border bg-surface shadow-card">
          <table className="w-full min-w-[1400px] border-collapse">
            <thead>
              <tr className="border-b border-ivory-border text-left">
                {[
                  "Relationship",
                  "Prospect / Resident",
                  "Type",
                  "Stage",
                  "Last Touch",
                  "Next Action",
                  "Due",
                  "Owner",
                  "Priority",
                  "Service Opportunity",
                  "Active Note",
                  "Attention",
                  "",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 font-sans text-label font-semibold uppercase tracking-widest text-subtle"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ivory-border">
              {filteredRows.map((row) => {
                const prospectOrResident = getProspectOrResidentLabel(row);
                const isExpanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr className="hover:bg-ivory-warm/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/relationships/${row.id}`}
                          className="font-sans text-sm font-semibold text-navy hover:text-navy-light"
                        >
                          {row.displayName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {prospectOrResident ? (
                          row.residentId ? (
                            <Link href={`/residents/${row.residentId}`} className="text-navy hover:text-navy-light">
                              {prospectOrResident.text}
                            </Link>
                          ) : (
                            <span className={prospectOrResident.isContact ? "text-subtle" : undefined}>
                              {prospectOrResident.text}
                            </span>
                          )
                        ) : (
                          <span className="text-subtle">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {RELATIONSHIP_TYPE_LABELS[row.relationshipType]}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {RELATIONSHIP_STAGE_LABELS[row.stage]}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {compactDate(row.lastMeaningfulTouchAt)}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.nearestAction?.title ?? <span className="text-subtle">-</span>}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {compactDate(row.nearestAction?.dueAt ?? null)}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.ownerLabel ?? <span className="text-subtle">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        {row.priority !== "normal" ? (
                          <Badge tone={row.priority === "urgent" ? "danger" : "warning"}>
                            {RELATIONSHIP_PRIORITY_LABELS[row.priority]}
                          </Badge>
                        ) : (
                          <span className="font-sans text-sm text-subtle">Normal</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.serviceOpportunity?.service_summary ? (
                          truncate(row.serviceOpportunity.service_summary, 40)
                        ) : (
                          <span className="text-subtle">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.activeNote ? truncate(row.activeNote.content, 40) : <span className="text-subtle">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={RELATIONSHIP_ATTENTION_BADGE_TONE[row.attentionStatus]}>
                          {RELATIONSHIP_ATTENTION_LABELS[row.attentionStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
                        >
                          {isExpanded ? "Close" : "Edit"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={COLUMN_COUNT} className="bg-ivory-warm/30 px-4 py-4">
                          <WhiteboardEditPanel row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
