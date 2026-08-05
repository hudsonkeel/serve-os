// Sections are configuration, not hardcoded UI branches — see
// docs/architecture/TODAYS_WORK_CONTINUITY.md. Adding a future section
// (e.g. "Waiting on Family", "Blocked") is a config-array edit plus one
// new WorkItemStatus value, never a rendering-logic rewrite.
import { rankWorkItems } from "./ranking.ts";
import type { WorkItem, WorkItemStatus } from "./workItem.ts";

export interface WorkSectionConfig {
  readonly status: WorkItemStatus;
  readonly label: string;
  readonly emptyStateDescription: string;
  // When true, the section renders its emptyStateDescription even with
  // zero items, rather than being omitted entirely — reserved for the
  // sections a user should always be able to confirm are actually empty.
  readonly alwaysRender?: boolean;
}

export const WORK_SECTION_CONFIG: readonly WorkSectionConfig[] = [
  {
    status: "needs_attention",
    label: "Needs Attention",
    emptyStateDescription: "Nothing needs immediate attention right now.",
    alwaysRender: true,
  },
  {
    status: "in_progress",
    label: "Resume Work",
    emptyStateDescription: "Nothing is currently in progress.",
  },
  {
    status: "due_today",
    label: "Due Today",
    emptyStateDescription: "Nothing is due today.",
    alwaysRender: true,
  },
  {
    status: "upcoming",
    label: "Upcoming",
    emptyStateDescription: "Nothing upcoming yet.",
  },
  {
    status: "waiting",
    label: "Waiting On",
    emptyStateDescription: "Nothing is waiting on another party.",
  },
  {
    status: "completed",
    label: "Recently Completed",
    emptyStateDescription: "Nothing completed recently.",
  },
];

export interface WorkSection extends WorkSectionConfig {
  readonly items: readonly WorkItem[];
}

export function bucketWorkItemsBySection(items: readonly WorkItem[]): WorkSection[] {
  return WORK_SECTION_CONFIG.map((config) => ({
    ...config,
    items: rankWorkItems(items.filter((item) => item.status === config.status)),
  }));
}
