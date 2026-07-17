import type { RelationshipPriority } from "@/lib/supabase/types";
import type { RelationshipAttentionStatus } from "./attention.ts";

// Deterministic ordering for the Relationship CRM foundation's Part 2
// operational views (Daily Action Board, Operational Whiteboard) and for
// selecting a Relationship's single "primary" open action when more than
// one exists. Every comparator here is a pure function over plain data —
// no DB, no React — so ordering behavior is unit-testable independent of
// incidental Postgres row order.

// Lower rank = more urgent. Shared by action selection and row sorting so
// "urgent" means the same thing everywhere in this module.
const PRIORITY_RANK: Record<RelationshipPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function compareNullableIso(
  a: string | null,
  b: string | null,
  nullsLast: boolean
): number {
  if (a === b) return 0;
  if (a === null) return nullsLast ? 1 : -1;
  if (b === null) return nullsLast ? -1 : 1;
  return new Date(a).getTime() - new Date(b).getTime();
}

// ─── Part 15: which open action is "the" Next Action ───────────────────
//
// A Relationship may have more than one open action (the detail page lets
// staff "+ Add Another Action"). Exactly one drives the workspace/board's
// Next Action column and the daily attention derivation; the rest stay
// visible on the detail page. Tie-break order: soonest due date (an action
// with no due date sorts after one that has any due date, however far
// out) → highest priority → oldest creation date. Ascending due-date sort
// alone already gives overdue actions precedence over future ones, since
// an overdue due_at is chronologically earlier — no separate "overdue
// wins" rule is needed.
export interface OpenActionLike {
  id: string;
  dueAt: string | null;
  priority: RelationshipPriority;
  createdAt: string;
}

export function selectPrimaryOpenAction<T extends OpenActionLike>(
  actions: readonly T[]
): T | null {
  if (actions.length === 0) return null;

  return [...actions].sort((a, b) => {
    const dueDiff = compareNullableIso(a.dueAt, b.dueAt, true);
    if (dueDiff !== 0) return dueDiff;

    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

// ─── Part 14: row ordering for the Action Board and Whiteboard ─────────

const ATTENTION_SEVERITY_RANK: Record<RelationshipAttentionStatus, number> = {
  overdue: 0,
  due_today: 1,
  due_this_week: 2,
  no_next_action: 3,
  upcoming: 4,
  on_hold: 5,
  closed: 6,
};

export interface SortableRelationshipRow {
  displayName: string;
  attentionStatus: RelationshipAttentionStatus;
  nearestActionDueAt: string | null;
  priority: RelationshipPriority;
  lastMeaningfulTouchAt: string | null;
  updatedAt: string;
}

// 1. overdue severity, 2. due date, 3. priority, 4. oldest last touch
// (never-touched sorts as oldest of all), 5. Relationship name.
export function sortActionBoardRows<T extends SortableRelationshipRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const severityDiff =
      ATTENTION_SEVERITY_RANK[a.attentionStatus] - ATTENTION_SEVERITY_RANK[b.attentionStatus];
    if (severityDiff !== 0) return severityDiff;

    const dueDiff = compareNullableIso(a.nearestActionDueAt, b.nearestActionDueAt, true);
    if (dueDiff !== 0) return dueDiff;

    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Oldest touch first — a never-touched relationship (null) is treated
    // as older than any touch that has ever happened.
    const touchDiff = compareNullableIso(a.lastMeaningfulTouchAt, b.lastMeaningfulTouchAt, false);
    if (touchDiff !== 0) return touchDiff;

    return a.displayName.localeCompare(b.displayName);
  });
}

// 1. attention severity, 2. due date, 3. priority, 4. most recently
// updated first, 5. Relationship name — guarantees a total, stable order
// even when every other key ties.
export function sortWhiteboardRows<T extends SortableRelationshipRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const severityDiff =
      ATTENTION_SEVERITY_RANK[a.attentionStatus] - ATTENTION_SEVERITY_RANK[b.attentionStatus];
    if (severityDiff !== 0) return severityDiff;

    const dueDiff = compareNullableIso(a.nearestActionDueAt, b.nearestActionDueAt, true);
    if (dueDiff !== 0) return dueDiff;

    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Most recently updated first.
    const updatedDiff = compareNullableIso(b.updatedAt, a.updatedAt, false);
    if (updatedDiff !== 0) return updatedDiff;

    return a.displayName.localeCompare(b.displayName);
  });
}
