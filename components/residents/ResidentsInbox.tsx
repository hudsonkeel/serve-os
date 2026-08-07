"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getCentralDayBoundaryUtc } from "@/lib/utils/date";
import { filterByRelationshipTab, matchesSearch, normalizeSearchQuery } from "@/lib/residents/search";
import type {
  EnrichedResidentRecord,
  ResidentRelationshipTabValue,
} from "@/lib/data/residentServeRelationships";
import type { ServeRelationship } from "@/lib/residents/serveRelationshipProjection";
import { FilterBanner } from "@/components/ui/FilterBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResidentRelationshipRow } from "./ResidentRelationshipRow";

const TABS: { value: ResidentRelationshipTabValue; label: string }[] = [
  { value: "all", label: "All Residents" },
  { value: "active_client", label: "Active Clients" },
  { value: "prospect", label: "Prospects" },
  { value: "inactive_client", label: "Inactive Clients" },
  { value: "no_current_relationship", label: "No Current Relationship" },
  { value: "needs_review", label: "Needs Review" },
];

type WellnessDueFilter = "now" | "week";

function filterByWellnessDue(
  records: EnrichedResidentRecord[],
  dueFilter: WellnessDueFilter
): EnrichedResidentRecord[] {
  const endOfToday = getCentralDayBoundaryUtc(0).getTime();
  const endOfWeek = getCentralDayBoundaryUtc(7).getTime();

  return records.filter((record) => {
    const dueAt = record.base.wellnessWatch?.nearestDueAt;
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
  records: EnrichedResidentRecord[];
  relationshipCounts: Record<ServeRelationship, number>;
  initialTab?: ResidentRelationshipTabValue;
  initialWellnessDue?: WellnessDueFilter;
  canCorrect: boolean;
}

export function ResidentsInbox({
  records,
  relationshipCounts,
  initialTab = "all",
  initialWellnessDue,
  canCorrect,
}: ResidentsInboxProps) {
  const [activeTab, setActiveTab] = useState<ResidentRelationshipTabValue>(initialTab);
  const [search, setSearch] = useState("");
  // Wellness Watch is a deliberately independent flag, not a relationship
  // tab — it can be toggled on top of any of the tabs above (e.g. "Active
  // Clients currently on Wellness Watch").
  const [wellnessWatchOnly, setWellnessWatchOnly] = useState(Boolean(initialWellnessDue));
  const [wellnessDueFilter, setWellnessDueFilter] = useState<WellnessDueFilter | undefined>(initialWellnessDue);

  const tabCounts: Record<ResidentRelationshipTabValue, number> = {
    all: records.length,
    active_client: relationshipCounts.active_client,
    prospect: relationshipCounts.prospect,
    inactive_client: relationshipCounts.inactive_client,
    no_current_relationship: relationshipCounts.no_current_relationship,
    needs_review: relationshipCounts.needs_review,
  };

  const tabFiltered = filterByRelationshipTab(records, activeTab);
  const wellnessFiltered = wellnessWatchOnly
    ? tabFiltered.filter((record) => record.base.wellnessWatch !== null)
    : tabFiltered;
  const wellnessDueFiltered =
    wellnessWatchOnly && wellnessDueFilter ? filterByWellnessDue(wellnessFiltered, wellnessDueFilter) : wellnessFiltered;

  const displayQuery = search.trim();
  const trimmedQuery = normalizeSearchQuery(search);
  const hasActiveSearch = trimmedQuery.length > 0;

  const visible = useMemo(() => {
    if (!trimmedQuery) return wellnessDueFiltered;
    return wellnessDueFiltered.filter((record) => matchesSearch(record.base, trimmedQuery));
  }, [wellnessDueFiltered, trimmedQuery]);

  const wellnessWatchTotal = records.filter((record) => record.base.wellnessWatch !== null).length;

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

      {hasActiveSearch && (
        <p role="status" aria-live="polite" className="font-sans text-sm font-medium text-muted">
          {resultSummaryText(visible.length)}
        </p>
      )}

      {/* Relationship tabs — the primary filter */}
      <div className="flex flex-wrap items-center gap-1 border-b border-ivory-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors ${
                isActive ? "border-b-navy text-navy" : "border-b-transparent text-muted hover:text-body"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-2 py-0.5 font-sans text-label font-semibold leading-none ${
                  isActive ? "bg-navy text-white" : "bg-ivory-warm text-muted"
                }`}
              >
                {tabCounts[tab.value]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Wellness Watch — independent toggle, applies within whatever tab is active */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setWellnessWatchOnly((prev) => !prev);
            if (wellnessWatchOnly) setWellnessDueFilter(undefined);
          }}
          aria-pressed={wellnessWatchOnly}
          className={`flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-1.5 font-sans text-sm font-medium transition-colors ${
            wellnessWatchOnly
              ? "border-warning-text/40 bg-warning-surface text-warning-text"
              : "border-ivory-border bg-surface text-muted hover:text-body"
          }`}
        >
          Wellness Watch only
          <span className="rounded-full bg-white/60 px-2 py-0.5 font-sans text-label font-semibold leading-none">
            {wellnessWatchTotal}
          </span>
        </button>
      </div>

      {wellnessWatchOnly && wellnessDueFilter && (
        <FilterBanner
          label={
            wellnessDueFilter === "now"
              ? "Due or overdue wellness follow-ups"
              : "Wellness follow-ups due within 7 days"
          }
          resultCount={visible.length}
          clearHref="/residents"
          clearLabel="Clear due-date filter"
        />
      )}

      {/* Resident list — one coherent population, enriched with relationship
          state per row. Filtering (tabs, Wellness Watch toggle, search)
          changes which residents are displayed; it never splits the
          population into permanent sub-groups. */}
      <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
        {visible.length > 0 ? (
          <div className="divide-y divide-ivory-border">
            {visible.map((record) => (
              <ResidentRelationshipRow key={record.base.id} record={record} canCorrect={canCorrect} />
            ))}
          </div>
        ) : (
          <div className="px-5 py-14">
            <EmptyState
              title={hasActiveSearch ? "No residents found" : undefined}
              description={
                hasActiveSearch
                  ? `No residents match "${displayQuery}." Try checking the spelling or searching by a different name or apartment number.`
                  : "No residents in this view."
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
