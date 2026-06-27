"use client";

import { useState } from "react";
import { Prospect, ProspectStatus } from "@/lib/supabase/types";
import { RESIDENT_TAB_COUNTS } from "@/lib/demo/communityData";
import { ResidentRow } from "./ResidentRow";

type TabValue = "all" | "wellness_watch" | "prospects" | "active_clients" | "former_clients";

const PROSPECT_STATUSES: ProspectStatus[] = ["new", "reviewing", "contacted", "assessment_scheduled"];

const TABS: { value: TabValue; label: string }[] = [
  { value: "all",             label: "All Residents" },
  { value: "wellness_watch",  label: "Wellness Watch" },
  { value: "prospects",       label: "Prospects" },
  { value: "active_clients",  label: "Active Clients" },
  { value: "former_clients",  label: "Former Clients" },
];

function filterByTab(prospects: Prospect[], tab: TabValue): Prospect[] {
  switch (tab) {
    case "wellness_watch":
      return prospects.filter((p) => p.start_timing === "immediately");
    case "prospects":
      return prospects.filter((p) =>
        (PROSPECT_STATUSES as string[]).includes(p.status)
      );
    case "active_clients":
      return prospects.filter((p) => p.status === "converted");
    case "former_clients":
      return prospects.filter((p) => p.status === "closed");
    default:
      return prospects;
  }
}

interface ResidentsInboxProps {
  prospects: Prospect[];
}

export function ResidentsInbox({ prospects }: ResidentsInboxProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("all");

  const visible = filterByTab(prospects, activeTab);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-ivory-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count = RESIDENT_TAB_COUNTS[tab.value] ?? 0;
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
            {visible.map((prospect) => (
              <ResidentRow key={prospect.id} prospect={prospect} />
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
