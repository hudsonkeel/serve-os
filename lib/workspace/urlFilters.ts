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
import type { AuthRole } from "../auth/constants.ts";

export type WorkspaceViewFilter = "all" | "mine" | "team" | "unassigned";

const VIEW_FILTERS: readonly WorkspaceViewFilter[] = ["all", "mine", "team", "unassigned"];

// Office Staff Workspace Simplification v0.1 — presentation only. Changes
// which view button renders, its label, and the default/fallback view for
// office_staff; never changes isUnassigned()/matchesCurrentUser() (see
// ownership.ts, untouched) or which WorkItems exist in the array being
// filtered (that's lib/data/todaysWork.ts's capability filtering, also
// untouched). "Team Work" surfaces items owned by someone else — a
// supervisory/dispatch concept with no established Office Staff job
// function — so office_staff gets no button for it at all. "Unassigned"
// is relabeled "Available Work" for office_staff only: identical
// underlying items, framed as "work I could pick up" instead of a
// dispatcher's "nobody owns this yet."
function isOfficeStaffRole(role: AuthRole | null | undefined): boolean {
  return role === "office_staff";
}

export interface WorkspaceViewOption {
  readonly value: WorkspaceViewFilter;
  readonly label: string;
}

const DEFAULT_VIEW_LABELS: Readonly<Record<WorkspaceViewFilter, string>> = {
  all: "All",
  mine: "My Work",
  team: "Team Work",
  unassigned: "Unassigned",
};

// Order matters here: for office_staff, "My Work" leads and "All" is
// pushed last (present, but secondary) — "what should I do" first, "let
// me browse everything I'm permitted to see" last. Every other role keeps
// the original, unordered-by-priority set exactly as before.
const OFFICE_STAFF_VIEW_ORDER: readonly WorkspaceViewFilter[] = ["mine", "unassigned", "all"];
const OFFICE_STAFF_VIEW_LABEL_OVERRIDES: Partial<Readonly<Record<WorkspaceViewFilter, string>>> = {
  unassigned: "Available Work",
};
const OFFICE_STAFF_HIDDEN_VIEWS: readonly WorkspaceViewFilter[] = ["team"];

// The buttons a viewer's own workspace should render — never used to
// decide what a request may filter to (that's isWorkspaceViewFilter's
// existing "is this a real value" gate, unchanged); this only decides
// what's shown as a first-class choice.
export function resolveWorkspaceViewOptions(role: AuthRole | null | undefined): WorkspaceViewOption[] {
  if (!isOfficeStaffRole(role)) {
    return VIEW_FILTERS.map((value) => ({ value, label: DEFAULT_VIEW_LABELS[value] }));
  }
  return OFFICE_STAFF_VIEW_ORDER.map((value) => ({
    value,
    label: OFFICE_STAFF_VIEW_LABEL_OVERRIDES[value] ?? DEFAULT_VIEW_LABELS[value],
  }));
}

// The view a workspace should land on when the URL carries no explicit
// (or no valid) `view` param at all — every non-office_staff role keeps
// today's "all" default unchanged.
export function resolveWorkspaceViewDefault(role: AuthRole | null | undefined): WorkspaceViewFilter {
  return isOfficeStaffRole(role) ? "mine" : "all";
}

function isViewHiddenForRole(view: WorkspaceViewFilter, role: AuthRole | null | undefined): boolean {
  return isOfficeStaffRole(role) && (OFFICE_STAFF_HIDDEN_VIEWS as readonly string[]).includes(view);
}

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
  "effectiveness_review",
  "infection_follow_up",
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
// server-rendered state and every client-side update. `role` is optional
// and purely presentational (Office Staff Workspace Simplification v0.1):
// omitting it reproduces the exact prior behavior for every existing
// caller/role. When supplied: a missing/invalid `view` param resolves to
// this role's own default (resolveWorkspaceViewDefault) instead of always
// "all"; an explicit but role-hidden value (office_staff requesting
// `view=team`, e.g. by hand-editing the URL) resolves to that role's
// default too, rather than silently activating a filter its own UI never
// offers as a button — the least surprising behavior for a value that is
// structurally valid but not meant to be reachable for this viewer.
export function parseWorkspaceFilters(
  searchParams: Readonly<Record<string, string | undefined>>,
  role?: AuthRole | null
): WorkspaceFilters {
  const rawView = searchParams.view;
  const view = isWorkspaceViewFilter(rawView)
    ? isViewHiddenForRole(rawView, role)
      ? resolveWorkspaceViewDefault(role)
      : rawView
    : resolveWorkspaceViewDefault(role);
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
