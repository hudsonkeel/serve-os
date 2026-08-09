"use client";

import { useMemo, useState } from "react";
import { bucketWorkItemsBySection } from "@/lib/workspace/sections";
import { isUnassigned, matchesCurrentUser, type OwnershipIdentity } from "@/lib/workspace/ownership";
import type { WorkItem } from "@/lib/workspace/workItem";
import { WorkItemRow } from "./WorkItemRow";

type WorkFilter = "all" | "mine" | "team" | "unassigned";

const FILTERS: { value: WorkFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "My Work" },
  { value: "team", label: "Team Work" },
  { value: "unassigned", label: "Unassigned" },
];

interface TodaysWorkViewProps {
  items: WorkItem[];
  currentUser: OwnershipIdentity;
}

// The continuity layer — additive to, never a replacement for, the
// Operational Summary rendered above it on the Workspace page. See
// docs/architecture/TODAYS_WORK_CONTINUITY.md. Defaults to "All" so urgent
// unassigned work is never hidden by default.
export function TodaysWorkView({ items, currentUser }: TodaysWorkViewProps) {
  const [filter, setFilter] = useState<WorkFilter>("all");

  const filtered = useMemo(() => {
    switch (filter) {
      case "mine":
        return items.filter((item) => matchesCurrentUser(item, currentUser));
      case "team":
        return items.filter((item) => !isUnassigned(item) && !matchesCurrentUser(item, currentUser));
      case "unassigned":
        return items.filter((item) => isUnassigned(item));
      case "all":
      default:
        return items;
    }
  }, [items, filter, currentUser]);

  const sections = useMemo(() => bucketWorkItemsBySection(filtered), [filtered]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors ${
              filter === f.value ? "bg-navy text-white" : "bg-ivory-warm text-muted hover:bg-ivory-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {sections.map((section) => {
          if (section.items.length === 0 && !section.alwaysRender) return null;
          return (
            <div key={section.status}>
              <h3 className="mb-3 font-serif text-card-title font-light text-body">{section.label}</h3>
              {section.items.length === 0 ? (
                <p className="rounded-lg border border-ivory-border bg-ivory px-5 py-4 font-sans text-sm text-muted">
                  {section.emptyStateDescription}
                </p>
              ) : (
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <WorkItemRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
