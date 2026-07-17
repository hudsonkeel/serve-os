"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  RELATIONSHIP_ATTENTION_BADGE_TONE,
  RELATIONSHIP_ATTENTION_LABELS,
} from "@/lib/relationships/attention";
import { RELATIONSHIP_STAGE_LABELS } from "@/lib/relationships/constants";
import { EXTERNAL_CLIENT_STATUS_LABELS } from "@/lib/externalClients/constants";
import {
  countByTab,
  EXTERNAL_CLIENT_TABS,
  ExternalClientTab,
  ExternalClientWorkspaceRow,
  filterByExternalClientTab,
  matchesExternalClientSearch,
  normalizeSearchQuery,
} from "@/lib/externalClients/search";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { AddExternalProspectForm } from "@/components/relationships/AddExternalProspectForm";

function compactDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface ExternalClientsWorkspaceProps {
  rows: ExternalClientWorkspaceRow[];
  autoOpenAdd?: boolean;
}

export function ExternalClientsWorkspace({ rows, autoOpenAdd = false }: ExternalClientsWorkspaceProps) {
  const [tab, setTab] = useState<ExternalClientTab>("prospects");
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(autoOpenAdd);

  const trimmedQuery = normalizeSearchQuery(search);
  const hasActiveSearch = trimmedQuery.length > 0;

  const tabCounts = useMemo(() => countByTab(rows), [rows]);

  const filteredRows = useMemo(() => {
    let result = filterByExternalClientTab(rows, tab);
    if (hasActiveSearch) {
      result = result.filter((r) => matchesExternalClientSearch(r, trimmedQuery));
    }
    return result;
  }, [rows, tab, hasActiveSearch, trimmedQuery]);

  const isLifecycleTab = tab !== "prospects";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isLifecycleTab
                ? "Search by client, city, or owner..."
                : "Search by prospect, care recipient, contact, or source..."
            }
            aria-label="Search external clients"
            className="h-12 w-full rounded-lg border border-ivory-border bg-surface px-4 font-sans text-base text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsAdding((open) => !open)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90"
        >
          {isAdding ? "Close" : "+ Add External Prospect"}
        </button>
      </div>

      {isAdding && <AddExternalProspectForm onDone={() => setIsAdding(false)} />}

      <div className="flex flex-wrap items-center gap-1 border-b border-ivory-border">
        {EXTERNAL_CLIENT_TABS.map((option) => {
          const isActive = tab === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTab(option.value)}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors ${
                isActive
                  ? "border-b-navy text-navy"
                  : "border-b-transparent text-muted hover:text-body"
              }`}
            >
              {option.label}
              <span
                className={`rounded-full px-2 py-0.5 font-sans text-label font-semibold leading-none ${
                  isActive ? "bg-navy text-white" : "bg-ivory-warm text-muted"
                }`}
              >
                {tabCounts[option.value]}
              </span>
            </button>
          );
        })}
      </div>

      {hasActiveSearch && (
        <p role="status" aria-live="polite" className="font-sans text-sm font-medium text-muted">
          {filteredRows.length === 0
            ? "No external clients found"
            : `${filteredRows.length} record${filteredRows.length === 1 ? "" : "s"} found`}
        </p>
      )}

      {filteredRows.length === 0 ? (
        <EmptyState
          title={hasActiveSearch ? "No external clients found" : undefined}
          description={
            hasActiveSearch
              ? `No records match "${search.trim()}." Try checking the spelling or searching by city or owner.`
              : tab === "prospects"
                ? "No External Prospects in this view yet."
                : "Nothing in this view yet."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ivory-border bg-surface shadow-card">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-ivory-border text-left">
                {(isLifecycleTab
                  ? ["Client", "City", "Service Start", "Owner", "Next Action", "Due", "Status"]
                  : ["Prospect", "Care Recipient", "Source", "Stage", "Next Action", "Due", "Owner", "Attention"]
                ).map((heading) => (
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
                  {isLifecycleTab ? (
                    <>
                      <td className="px-4 py-3 font-sans text-sm text-body">{row.city ?? "-"}</td>
                      <td className="px-4 py-3 font-sans text-sm text-body">{compactDate(row.serviceStartDate)}</td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.ownerLabel ?? <span className="text-subtle">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.nearestActionTitle ?? <span className="text-subtle">-</span>}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">{compactDate(row.nearestActionDueAt)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={row.externalClientStatus === "active" ? "gold" : "neutral"}>
                          {row.externalClientStatus ? EXTERNAL_CLIENT_STATUS_LABELS[row.externalClientStatus] : "-"}
                        </Badge>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.prospectiveResidentName ?? <span className="text-subtle">-</span>}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.primaryContactName ?? <span className="text-subtle">-</span>}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {RELATIONSHIP_STAGE_LABELS[row.stage]}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.nearestActionTitle ?? <span className="text-subtle">-</span>}
                      </td>
                      <td className="px-4 py-3 font-sans text-sm text-body">{compactDate(row.nearestActionDueAt)}</td>
                      <td className="px-4 py-3 font-sans text-sm text-body">
                        {row.ownerLabel ?? <span className="text-subtle">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={RELATIONSHIP_ATTENTION_BADGE_TONE[row.attentionStatus]}>
                          {RELATIONSHIP_ATTENTION_LABELS[row.attentionStatus]}
                        </Badge>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
