// Deterministic ranking for Work Items — mirrors
// lib/relationships/sorting.ts's style exactly (a rank table + an explicit,
// documented tie-break chain, pure/no I/O, a `now` param for testability).
// No LLM ranking, per docs/architecture/TODAYS_WORK_CONTINUITY.md.
import type { WorkItem, WorkItemPriority } from "./workItem.ts";

const PRIORITY_RANK: Record<WorkItemPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// Undefined priority ranks after every explicit priority — a Work Item
// with no priority signal (e.g. a stage-derived assessment/proposal item)
// is never assumed as important as one that explicitly says "urgent".
function priorityRank(priority: WorkItemPriority | undefined): number {
  return priority ? PRIORITY_RANK[priority] : PRIORITY_RANK.normal + 1;
}

function compareNullableIso(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

// Ordering within a single section (see lib/workspace/sections.ts):
// 1. overdue-ness is already reflected upstream by which section an item
//    landed in (needs_attention vs. due_today vs. upcoming), so within one
//    section every item is already at the same urgency tier — remaining
//    ties are broken by:
// 2. priority (urgent > high > normal > low > undefined)
// 3. dueAt ascending (undated sorts last)
// 4. id, for a fully stable, deterministic order when everything else ties
export function rankWorkItems(items: readonly WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const dueDiff = compareNullableIso(a.dueAt, b.dueAt);
    if (dueDiff !== 0) return dueDiff;

    return a.id.localeCompare(b.id);
  });
}
