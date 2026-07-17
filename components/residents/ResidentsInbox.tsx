"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  CommunityResidentRecord,
  ResidentTabValue,
} from "@/lib/data/communityMetrics";
import { getCentralDayBoundaryUtc } from "@/lib/utils/date";
import {
  buildBlendedGroups,
  countGroupRecords,
  filterByTab,
  matchesSearch,
  normalizeSearchQuery,
} from "@/lib/residents/search";
import { FilterBanner } from "@/components/ui/FilterBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResidentRow } from "./ResidentRow";

const TABS: { value: ResidentTabValue; label: string }[] = [
  { value: "all",             label: "All Residents" },
  { value: "active_clients",  label: "Active Clients" },
  { value: "hold",            label: "On Hold" },
  { value: "former_clients",  label: "Former Clients" },
  { value: "wellness_watch",  label: "Wellness Watch" },
];

type WellnessDueFilter = "now" | "week";

function filterByWellnessDue(
  records: CommunityResidentRecord[],
  dueFilter: WellnessDueFilter
): CommunityResidentRecord[] {
  const endOfToday = getCentralDayBoundaryUtc(0).getTime();
  const endOfWeek = getCentralDayBoundaryUtc(7).getTime();

  return records.filter((record) => {
    const dueAt = record.wellnessWatch?.nearestDueAt;
    if (!dueAt) return false;
    const dueAtMs = new Date(dueAt).getTime();

    if (dueFilter === "now") return dueAtMs < endOfToday;
    return dueAtMs >= endOfToday && dueAtMs < endOfWeek;
  });
}

function resultSummaryText(totalCount: number): string {
  if (totalCount === 0) return "No residents found";
  return `${totalCount} resident${totalCount === 1 ? "" : "s"} found`;
}

interface ResidentsInboxProps {
  records: CommunityResidentRecord[];
  tabCounts: Record<ResidentTabValue, number>;
  initialTab?: ResidentTabValue;
  initialWellnessDue?: WellnessDueFilter;
}

export function ResidentsInbox({
  records,
  tabCounts,
  initialTab = "all",
  initialWellnessDue,
}: ResidentsInboxProps) {
  const [activeTab, setActiveTab] = useState<ResidentTabValue>(initialTab);
  const [search, setSearch] = useState("");
  const [wellnessDueFilter, setWellnessDueFilter] = useState<
    WellnessDueFilter | undefined
  >(initialWellnessDue);

  const tabFiltered = filterByTab(records, activeTab);
  const wellnessDueFiltered =
    activeTab === "wellness_watch" && wellnessDueFilter
      ? filterByWellnessDue(tabFiltered, wellnessDueFilter)
      : tabFiltered;

  // Trimmed-but-not-lowercased query, for display in messaging (preserves
  // what the user actually typed). trimmedQuery (lowercased) drives matching.
  const displayQuery = search.trim();
  const trimmedQuery = normalizeSearchQuery(search);
  const hasActiveSearch = trimmedQuery.length > 0;

  const visible = useMemo(() => {
    if (!trimmedQuery) return wellnessDueFiltered;
    return wellnessDueFiltered.filter((record) => matchesSearch(record, trimmedQuery));
  }, [wellnessDueFiltered, trimmedQuery]);

  // Blended default view: active clients, then everyone else. Each
  // resident appears in exactly one bucket since serveRelationshipStatus
  // is already a single mutually-exclusive value — no separate precedence
  // logic is needed. Reuses the same `records` array (and search
  // filtering) rather than issuing new queries. Groups with zero matches
  // are dropped entirely while a search is active — see
  // buildBlendedGroups() in lib/residents/search.ts.
  const blendedSections = useMemo(() => {
    if (activeTab !== "all") return null;
    return buildBlendedGroups(records, trimmedQuery);
  }, [activeTab, records, trimmedQuery]);

  const totalMatchCount = blendedSections
    ? countGroupRecords(blendedSections)
    : visible.length;

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by resident name or apartment..."
          aria-label="Search residents"
          className="h-12 w-full max-w-md rounded-lg border border-ivory-border bg-surface pl-11 pr-4 font-sans text-base text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
        />
      </div>

      {/* Search result summary — mounted only while a search is active, so
          the normal (no-search) directory layout is unchanged. Content
          updates are announced to assistive technology via aria-live. */}
      {hasActiveSearch && (
        <p
          role="status"
          aria-live="polite"
          className="font-sans text-sm font-medium text-muted"
        >
          {resultSummaryText(totalMatchCount)}
        </p>
      )}

      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-ivory-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count = tabCounts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setActiveTab(tab.value);
                if (tab.value !== "wellness_watch") setWellnessDueFilter(undefined);
              }}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors ${
                isActive
                  ? "border-b-navy text-navy"
                  : "border-b-transparent text-muted hover:text-body"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-2 py-0.5 font-sans text-label font-semibold leading-none ${
                  isActive ? "bg-navy text-white" : "bg-ivory-warm text-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {activeTab === "wellness_watch" && wellnessDueFilter && (
        <FilterBanner
          label={
            wellnessDueFilter === "now"
              ? "Due or overdue wellness follow-ups"
              : "Wellness follow-ups due within 7 days"
          }
          resultCount={visible.length}
          clearHref="/residents?tab=wellness_watch"
          clearLabel="View all Wellness Watch residents"
        />
      )}

      {/* Resident list */}
      {blendedSections ? (
        blendedSections.length > 0 ? (
          <div className="space-y-8">
            {blendedSections.map((section) => (
              <div key={section.key}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-sans text-base font-semibold text-body">
                    {section.heading}
                  </h3>
                  <span className="rounded-full bg-ivory-warm px-2.5 py-0.5 font-sans text-label font-semibold text-muted">
                    {section.records.length}
                  </span>
                </div>
                <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
                  {section.records.length > 0 ? (
                    <div className="divide-y divide-ivory-border">
                      {section.records.map((record) => (
                        <ResidentRow key={record.id} record={record} />
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-8">
                      <EmptyState description="No residents in this section." />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
            <div className="px-5 py-14">
              <EmptyState
                title="No residents found"
                description={`No residents match "${displayQuery}." Try checking the spelling or searching by a different name or apartment number.`}
              />
            </div>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
          {visible.length > 0 ? (
            <div className="divide-y divide-ivory-border">
              {visible.map((record) => (
                <ResidentRow key={record.id} record={record} />
              ))}
            </div>
          ) : (
            <div className="px-5 py-14">
              <EmptyState
                title={hasActiveSearch ? "No residents found" : undefined}
                description={
                  hasActiveSearch
                    ? `No residents match "${displayQuery}." Try checking the spelling or searching by a different name or apartment number.`
                    : activeTab === "wellness_watch"
                      ? "No residents currently have an open wellness follow-up."
                      : "No residents in this view."
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
