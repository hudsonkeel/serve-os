"use client";

import { useState } from "react";
import { Prospect } from "@/lib/supabase/types";
import { ProspectRow } from "./ProspectRow";
import { ProspectDetail } from "./ProspectDetail";
import { StatusFilter, FilterValue } from "./StatusFilter";

const HEADERS = [
  "Flags",
  "Prospect",
  "Contact",
  "Support",
  "Timing",
  "Referral",
  "Status",
  "Actions",
  "Received",
  "",
];

interface ProspectInboxProps {
  prospects: Prospect[];
}

export function ProspectInbox({ prospects }: ProspectInboxProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all");

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleFilterChange(value: FilterValue) {
    setActiveFilter(value);
    // Close any open detail panel when switching filters — the row may not
    // be visible in the new view.
    setExpandedId(null);
  }

  // Counts from the full list (always reflects current server data)
  const counts = prospects.reduce<Partial<Record<FilterValue, number>>>(
    (acc, p) => {
      acc.all = (acc.all ?? 0) + 1;
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const visible =
    activeFilter === "all"
      ? prospects
      : prospects.filter((p) => p.status === activeFilter);

  return (
    <div className="space-y-4">
      {/* Page-level status filter */}
      <StatusFilter
        active={activeFilter}
        counts={counts}
        onSelect={handleFilterChange}
      />

      {/* Inbox table */}
      <div className="rounded-xl border border-ivory-border bg-white shadow-card">
        {/* Column headers */}
        <div className="prospect-inbox-grid rounded-t-xl grid items-center gap-x-4 border-b border-ivory-border bg-ivory-warm px-5 py-2.5">
          {HEADERS.map((h, i) => (
            <span
              key={i}
              className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted"
            >
              {h}
            </span>
          ))}
        </div>

        {/* Rows — filtered */}
        {visible.length > 0 ? (
          <div className="divide-y divide-ivory-border">
            {visible.map((prospect) => (
              <div key={prospect.id}>
                <ProspectRow
                  prospect={prospect}
                  isExpanded={expandedId === prospect.id}
                  onToggle={() => toggle(prospect.id)}
                />
                {expandedId === prospect.id && (
                  <ProspectDetail prospect={prospect} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <p className="font-sans text-sm text-muted">
              No prospects with this status.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
