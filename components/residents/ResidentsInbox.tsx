"use client";

import { useState } from "react";
import { ProspectStatus } from "@/lib/supabase/types";
import {
  CommunityResidentRecord,
  ResidentTabValue,
} from "@/lib/data/communityMetrics";
import { ResidentRow } from "./ResidentRow";

const PROSPECT_STATUSES: ProspectStatus[] = ["new", "reviewing", "contacted", "assessment_scheduled"];

const TABS: { value: ResidentTabValue; label: string }[] = [
  { value: "all",             label: "All Residents" },
  { value: "wellness_watch",  label: "Wellness Watch" },
  { value: "prospects",       label: "Prospects" },
  { value: "active_clients",  label: "Active Clients" },
  { value: "former_clients",  label: "Former Clients" },
];

function filterByTab(
  records: CommunityResidentRecord[],
  tab: ResidentTabValue
): CommunityResidentRecord[] {
  const demoRecords = records.filter((record) => record.source === "Demo Data");

  switch (tab) {
    case "wellness_watch":
      return demoRecords.filter(
        (record) => record.prospect.start_timing === "immediately"
      );
    case "prospects":
      return records.filter((record) =>
        (PROSPECT_STATUSES as string[]).includes(record.prospect.status)
      );
    case "active_clients":
      return demoRecords.filter((record) => record.prospect.status === "converted");
    case "former_clients":
      return demoRecords.filter((record) => record.prospect.status === "closed");
    default:
      return demoRecords;
  }
}

interface ResidentsInboxProps {
  records: CommunityResidentRecord[];
  tabCounts: Record<ResidentTabValue, number>;
}

export function ResidentsInbox({ records, tabCounts }: ResidentsInboxProps) {
  const [activeTab, setActiveTab] = useState<ResidentTabValue>("all");

  const visible = filterByTab(records, activeTab);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-ivory-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count = tabCounts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-2 border-b-2 px-4 pb-3 pt-1 font-sans text-sm transition-colors ${
                isActive
                  ? "border-b-navy text-navy"
                  : "border-b-transparent text-muted hover:text-body"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 font-sans text-[10px] font-semibold leading-none ${
                  isActive ? "bg-navy text-white" : "bg-ivory-warm text-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Resident list */}
      <div className="rounded-xl border border-ivory-border bg-white shadow-card">
        {visible.length > 0 ? (
          <div className="divide-y divide-ivory-border">
            {visible.map((record) => (
              <ResidentRow key={record.id} record={record} />
            ))}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <p className="font-sans text-sm text-muted">No residents in this view.</p>
            {activeTab === "wellness_watch" && (
              <p className="mt-1 font-sans text-xs text-muted">
                Residents with immediate care needs appear here.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
