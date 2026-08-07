"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { AxisCareClientRow } from "./AxisCareClientRow";
import type { AxisCareClientOperationalSummary } from "@/lib/data/axiscareClientOperationalSummary";
import type { AxisCareClientOperationalBucket } from "@/lib/integrations/axiscare/clientOperationalStatus";

type TabValue = "all" | AxisCareClientOperationalBucket;

const TABS: { value: TabValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active_client", label: "Active Clients" },
  { value: "inactive_client", label: "Inactive Clients" },
  { value: "prospect", label: "Prospects" },
  { value: "needs_review", label: "Needs Review" },
  { value: "excluded", label: "Excluded" },
];

function matchesSearch(name: string, axiscareId: string, query: string): boolean {
  return name.toLowerCase().includes(query) || axiscareId.includes(query);
}

interface AxisCareClientRosterProps {
  summary: AxisCareClientOperationalSummary;
}

export function AxisCareClientRoster({ summary }: AxisCareClientRosterProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [search, setSearch] = useState("");

  const tabCounts: Record<TabValue, number> = {
    all: summary.rows.length,
    active_client: summary.counts.active_client,
    inactive_client: summary.counts.inactive_client,
    prospect: summary.counts.prospect,
    needs_review: summary.counts.needs_review,
    excluded: summary.counts.excluded,
  };

  const tabFiltered = useMemo(
    () => (activeTab === "all" ? summary.rows : summary.rows.filter((row) => row.operationalBucket === activeTab)),
    [summary.rows, activeTab]
  );

  const trimmedQuery = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!trimmedQuery) return tabFiltered;
    return tabFiltered.filter((row) => matchesSearch(row.name, row.axiscareId, trimmedQuery));
  }, [tabFiltered, trimmedQuery]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or AxisCare ID..."
          aria-label="Search AxisCare clients"
          className="h-12 w-full max-w-md rounded-lg border border-ivory-border bg-surface pl-11 pr-4 font-sans text-base text-body outline-none transition-colors placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-ivory-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          const isExcludedTab = tab.value === "excluded";
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2.5 font-sans text-button font-medium transition-colors ${
                isActive
                  ? "border-b-navy text-navy"
                  : isExcludedTab
                    ? "border-b-transparent text-subtle hover:text-muted"
                    : "border-b-transparent text-muted hover:text-body"
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

      {activeTab === "excluded" && (
        <div className="rounded-lg border border-ivory-border bg-ivory px-4 py-3 font-sans text-sm text-muted">
          These AxisCare records have been reviewed and marked as not representing a true operational client
          (e.g. a related person, an administrative/community record, or a test record). They are excluded from
          Active, Inactive, and Prospect counts but are kept visible here, with the reviewer&rsquo;s rationale, rather
          than deleted.
        </div>
      )}

      <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
        {visible.length > 0 ? (
          <div className="divide-y divide-ivory-border">
            {visible.map((row) => (
              <AxisCareClientRow key={row.axiscareId} row={row} />
            ))}
          </div>
        ) : (
          <div className="px-5 py-14">
            <EmptyState
              title={trimmedQuery ? "No matches found" : undefined}
              description={
                trimmedQuery
                  ? `No AxisCare clients match "${search.trim()}."`
                  : "No AxisCare clients in this view."
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
