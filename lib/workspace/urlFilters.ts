// URL-backed Today's Work filter state — pure parse/build functions, no
// client-state library, no I/O. Query params are the single source of
// truth (Product decision #7): `view` (ownership) and `source`
// (sourceType/category), read server-side in app/workspace/page.tsx to
// compute Operational Summary hrefs and the initial filtered view, and
// read/written client-side in TodaysWorkView.tsx via next/navigation's
// useSearchParams/useRouter — never a separate client useState copy of
// this same state, so refresh/back-forward/deep-links all stay consistent
// by construction.
import type { WorkItem, WorkItemSourceType } from "./workItem.ts";

export type WorkspaceViewFilter = "all" | "mine" | "team" | "unassigned";

const VIEW_FILTERS: readonly WorkspaceViewFilter[] = ["all", "mine", "team", "unassigned"];

// "governance" is a virtual, filter-only grouping — never a real
// WorkItemSourceType (no mapper ever produces one). It exists purely so
// the Operational Summary's single Governance & Quality card can deep-link
// to every governance-shaped source at once without Today's Work growing
// a fourth-through-seventh separate card (product decision #3: "do not
// simply add endless cards").
export const GOVERNANCE_SOURCE_TYPES: readonly WorkItemSourceType[] = [
  "incident",
  "infection",
  "compliance_requirement",
  "corrective_action",
];

export type WorkspaceSourceFilter = WorkItemSourceType | "governance" | "all";

export interface WorkspaceFilters {
  readonly view: WorkspaceViewFilter;
  readonly source: WorkspaceSourceFilter;
}

export const DEFAULT_WORKSPACE_FILTERS: WorkspaceFilters = { view: "all", source: "all" };

function isWorkspaceViewFilter(value: string | undefined): value is WorkspaceViewFilter {
  return !!value && (VIEW_FILTERS as readonly string[]).includes(value);
}

// Accepts a plain string map (works identically for a server component's
// awaited `searchParams` and a client component's `Object.fromEntries(
// useSearchParams())`), so the exact same parser backs both the initial
// server-rendered state and every client-side update.
export function parseWorkspaceFilters(searchParams: Readonly<Record<string, string | undefined>>): WorkspaceFilters {
  const view = isWorkspaceViewFilter(searchParams.view) ? searchParams.view : DEFAULT_WORKSPACE_FILTERS.view;
  const source = (searchParams.source as WorkspaceSourceFilter | undefined) ?? DEFAULT_WORKSPACE_FILTERS.source;
  return { view, source };
}

// Builds a /workspace href for a given filter combination — omits a param
// entirely when it's the default, so "All / All" stays the plain,
// shareable /workspace root rather than always growing a query string.
export function buildWorkspaceHref(filters: Partial<WorkspaceFilters>): string {
  const params = new URLSearchParams();
  if (filters.view && filters.view !== DEFAULT_WORKSPACE_FILTERS.view) params.set("view", filters.view);
  if (filters.source && filters.source !== DEFAULT_WORKSPACE_FILTERS.source) params.set("source", filters.source);
  const query = params.toString();
  return query ? `/workspace?${query}` : "/workspace";
}

export function matchesSourceFilter(item: WorkItem, source: WorkspaceSourceFilter): boolean {
  if (source === "all") return true;
  if (source === "governance") return (GOVERNANCE_SOURCE_TYPES as readonly string[]).includes(item.sourceType);
  return item.sourceType === source;
}

// "Actionable" for Operational Summary counting purposes (product decision
// #2): still open/in-progress/upcoming work, not a completed record kept
// around only for the Recently Completed section. Never excludes
// "waiting" — an on-hold item is still real, just not yet due; today no
// summary card maps to a sourceType that ever produces "waiting" status,
// but the predicate itself makes no assumption about that.
export function isActionableWorkItem(item: WorkItem): boolean {
  return item.status !== "completed";
}

// The one shared counting rule every "actionable count" summary card uses
// — count of actionable WorkItems matching a source filter, computed from
// the SAME composed array TodaysWorkView renders below it (product
// decision #2/"Summary Source of Truth": no independent broad-population
// count may silently differ).
export function countActionableWorkItems(items: readonly WorkItem[], source: WorkspaceSourceFilter): number {
  return items.filter((item) => isActionableWorkItem(item) && matchesSourceFilter(item, source)).length;
}
