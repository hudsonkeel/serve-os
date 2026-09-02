"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { bucketWorkItemsBySection } from "@/lib/workspace/sections";
import { isUnassigned, matchesCurrentUser, type OwnershipIdentity } from "@/lib/workspace/ownership";
import {
  buildWorkspaceHref,
  matchesSourceFilter,
  parseWorkspaceFilters,
  type WorkspaceFilters,
  type WorkspaceSourceFilter,
  type WorkspaceViewFilter,
} from "@/lib/workspace/urlFilters";
import type { WorkItem } from "@/lib/workspace/workItem";
import { SOURCE_LABELS, WorkItemRow } from "./WorkItemRow";

const VIEW_FILTERS: { value: WorkspaceViewFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "My Work" },
  { value: "team", label: "Team Work" },
  { value: "unassigned", label: "Unassigned" },
];

function sourceFilterLabel(source: WorkspaceSourceFilter): string {
  if (source === "all") return "All";
  if (source === "governance") return "Governance & Quality";
  return SOURCE_LABELS[source];
}

interface TodaysWorkViewProps {
  items: WorkItem[];
  currentUser: OwnershipIdentity;
  // Server-parsed initial state (from app/workspace/page.tsx's awaited
  // searchParams) — used only for the very first render, before this
  // client component's own useSearchParams() takes over as the single
  // source of truth. Keeps first paint and hydration consistent without a
  // second, potentially-diverging copy of this same state.
  initialFilters: WorkspaceFilters;
}

// The continuity layer — additive to, never a replacement for, the
// Operational Summary rendered above it on the Workspace page. See
// docs/architecture/TODAYS_WORK_CONTINUITY.md. Defaults to "All" so urgent
// unassigned work is never hidden by default.
//
// URL-backed (Today's Work Actionability slice, product decision #7):
// filter state lives entirely in the ?view=&source= query string, read via
// useSearchParams() on every render — no local useState copy to drift out
// of sync with the address bar. This is what makes a summary-card
// deep-link (?source=wellness_follow_up), a refresh, and the browser's
// back/forward buttons all land on the exact same filtered list.
export function TodaysWorkView({ items, currentUser, initialFilters }: TodaysWorkViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // useSearchParams() reflects the same URL on both the server render and
  // the client hydration pass for this force-dynamic page, so it's always
  // populated in practice; initialFilters (server-parsed) is kept only as
  // a defensive fallback, never a second source of truth once mounted.
  const filters = searchParams ? parseWorkspaceFilters(Object.fromEntries(searchParams.entries())) : initialFilters;

  function updateFilters(next: Partial<WorkspaceFilters>) {
    router.push(buildWorkspaceHref({ ...filters, ...next }));
  }

  const bySource = items.filter((item) => matchesSourceFilter(item, filters.source));
  const filtered = (() => {
    switch (filters.view) {
      case "mine":
        return bySource.filter((item) => matchesCurrentUser(item, currentUser));
      case "team":
        return bySource.filter((item) => !isUnassigned(item) && !matchesCurrentUser(item, currentUser));
      case "unassigned":
        return bySource.filter((item) => isUnassigned(item));
      case "all":
      default:
        return bySource;
    }
  })();

  const sections = bucketWorkItemsBySection(filtered);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {VIEW_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => updateFilters({ view: f.value })}
            className={`rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors ${
              filters.view === f.value ? "bg-navy text-white" : "bg-ivory-warm text-muted hover:bg-ivory-border"
            }`}
          >
            {f.label}
          </button>
        ))}

        {filters.source !== "all" && (
          <button
            type="button"
            onClick={() => updateFilters({ source: "all" })}
            className="rounded-full bg-gold/15 px-3 py-1.5 font-sans text-sm font-medium text-gold-dark transition-colors hover:bg-gold/25"
          >
            {sourceFilterLabel(filters.source)} ✕
          </button>
        )}
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
