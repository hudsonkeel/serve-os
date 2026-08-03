"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { WorkforceRosterEntry } from "@/lib/workforce/roster";
import type { WorkforceLifecycleStatus } from "@/lib/workforce/lifecycleStatus";
import { ATTENTION_STATE_RANK, type AttentionState } from "@/lib/workforce/attentionState";

// Level 1 — the Workforce List. Per the Attention-Driven Operations
// mission: "who needs attention / ready / approaching / requires review,
// no detailed requirement matrix." The old NAR/EMR/Registry
// Evidence/Employee Record Audit readiness columns are gone — Attention
// State + the single Next Best Action are the only things this level
// shows about compliance. Everything else is one click away at Level 2.
type FilterValue =
  | "all"
  | "active"
  | "inactive"
  | "terminated"
  | "pending_start"
  | "attention_action_needed"
  | "attention_due_soon"
  | "attention_review"
  | "attention_waiting"
  | "attention_ready"
  | "has_open_actions";

const FILTER_ORDER: FilterValue[] = [
  "all",
  "attention_action_needed",
  "attention_due_soon",
  "attention_review",
  "attention_waiting",
  "attention_ready",
  "active",
  "pending_start",
  "inactive",
  "terminated",
];

const FILTER_LABELS: Record<FilterValue, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
  pending_start: "Pending Start",
  attention_action_needed: "Action Needed",
  attention_due_soon: "Due Soon",
  attention_review: "Review",
  attention_waiting: "Waiting",
  attention_ready: "Ready",
  has_open_actions: "Has Open Actions",
};

const LIFECYCLE_LABELS: Record<WorkforceLifecycleStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
  pending_start: "Pending Start",
};

const LIFECYCLE_STYLES: Record<WorkforceLifecycleStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-ivory-warm text-muted",
  terminated: "bg-red-50 text-red-700",
  pending_start: "bg-blue-50 text-blue-700",
};

export const ATTENTION_STATE_LABELS: Record<AttentionState, string> = {
  action_needed: "Action Needed",
  due_soon: "Due Soon",
  review: "Review",
  waiting: "Waiting",
  ready: "Ready",
  not_applicable: "Not Applicable",
};

export const ATTENTION_STATE_STYLES: Record<AttentionState, string> = {
  action_needed: "bg-red-50 text-red-700",
  due_soon: "bg-amber-50 text-amber-700",
  review: "bg-orange-50 text-orange-700",
  waiting: "bg-blue-50 text-blue-700",
  ready: "bg-emerald-50 text-emerald-700",
  not_applicable: "bg-ivory-warm text-muted",
};

function matchesFilter(entry: WorkforceRosterEntry, filter: FilterValue): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return entry.lifecycle.status === "active";
    case "inactive":
      return entry.lifecycle.status === "inactive";
    case "terminated":
      return entry.lifecycle.status === "terminated";
    case "pending_start":
      return entry.lifecycle.status === "pending_start";
    case "attention_action_needed":
      return entry.attentionState.state === "action_needed";
    case "attention_due_soon":
      return entry.attentionState.state === "due_soon";
    case "attention_review":
      return entry.attentionState.state === "review";
    case "attention_waiting":
      return entry.attentionState.state === "waiting";
    case "attention_ready":
      return entry.attentionState.state === "ready";
    case "has_open_actions":
      return entry.openActions.length > 0;
  }
}

const ALL_FILTER_VALUES: FilterValue[] = [...FILTER_ORDER, "has_open_actions"];

function isFilterValue(value: string | undefined): value is FilterValue {
  return Boolean(value) && (ALL_FILTER_VALUES as readonly string[]).includes(value!);
}

function formatTerminationDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function WorkforceRosterTable({
  roster,
  identityReviewCount,
  defaultFilter,
}: {
  roster: WorkforceRosterEntry[];
  identityReviewCount: number;
  defaultFilter?: string;
}) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>(isFilterValue(defaultFilter) ? defaultFilter : "all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c: Partial<Record<FilterValue, number>> = {};
    for (const filter of FILTER_ORDER) {
      c[filter] = roster.filter((entry) => matchesFilter(entry, filter)).length;
    }
    return c;
  }, [roster]);

  // Operational sort: most urgent first, safest employees fall to the
  // bottom — the roster never sorts alphabetically by default, since the
  // whole point is "determine your next hour of work in under ten
  // seconds" without scanning past everyone who's already fine.
  const visible = useMemo(() => {
    const filtered = roster.filter((entry) => matchesFilter(entry, activeFilter));
    const searched = search.trim()
      ? filtered.filter((entry) => entry.displayName.toLowerCase().includes(search.trim().toLowerCase()))
      : filtered;
    return searched.slice().sort((a, b) => {
      const rankDiff = ATTENTION_STATE_RANK[b.attentionState.state] - ATTENTION_STATE_RANK[a.attentionState.state];
      if (rankDiff !== 0) return rankDiff;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [roster, activeFilter, search]);

  return (
    <div className="space-y-4">
      {identityReviewCount > 0 && (
        <Link
          href="/workforce/identity-review"
          className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 font-sans text-sm text-amber-800 hover:border-amber-300"
        >
          <span>
            {identityReviewCount} AxisCare {identityReviewCount === 1 ? "caregiver needs" : "caregivers need"} identity
            review before they appear here.
          </span>
          <span className="font-semibold underline">Review now →</span>
        </Link>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_ORDER.map((value) => {
            const isActive = activeFilter === value;
            const count = counts[value] ?? 0;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveFilter(value)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-navy text-white"
                    : "border border-ivory-border bg-surface text-muted hover:border-navy/20 hover:text-body"
                }`}
              >
                {FILTER_LABELS[value]}
                <span
                  className={`min-w-[1.25rem] rounded-full px-1 py-0.5 text-center text-[10px] font-semibold leading-none ${
                    isActive ? "bg-white/20 text-white" : "bg-ivory-warm text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-56 rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-ivory-border bg-surface shadow-card">
        <div className="grid min-w-max grid-cols-[2fr_1fr_1fr_2.2fr] items-center gap-x-4 rounded-t-xl border-b border-ivory-border bg-ivory-warm px-5 py-2.5">
          {["Caregiver", "Workforce Status", "Attention", "Next Best Action"].map((h) => (
            <span key={h} className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              {h}
            </span>
          ))}
        </div>

        {visible.length > 0 ? (
          <div className="min-w-max divide-y divide-ivory-border">
            {visible.map((entry) => (
              <div key={entry.workforceMemberId} className="grid grid-cols-[2fr_1fr_1fr_2.2fr] items-center gap-x-4 px-5 py-3">
                <Link
                  href={`/workforce/${entry.workforceMemberId}`}
                  className="truncate font-sans text-sm font-medium text-navy hover:text-navy-light hover:underline"
                >
                  {entry.displayName}
                </Link>
                <div>
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${LIFECYCLE_STYLES[entry.lifecycle.status]}`}
                  >
                    {LIFECYCLE_LABELS[entry.lifecycle.status]}
                  </span>
                  {entry.lifecycle.terminationDate && (
                    <p className="mt-0.5 font-sans text-[11px] text-muted">{formatTerminationDate(entry.lifecycle.terminationDate)}</p>
                  )}
                </div>
                <span
                  className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${ATTENTION_STATE_STYLES[entry.attentionState.state]}`}
                >
                  {ATTENTION_STATE_LABELS[entry.attentionState.state]}
                </span>
                <span className="truncate font-sans text-xs text-body" title={entry.nextAction?.title}>
                  {entry.nextAction ? entry.nextAction.title : "No action required"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="font-sans text-sm text-muted">No caregivers match this filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
