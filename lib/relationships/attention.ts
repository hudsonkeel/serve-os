import { getCentralDayBoundaryUtc } from "../utils/date.ts";
import type {
  RelationshipStatus,
  RelationshipType,
} from "@/lib/supabase/types";
import { PROSPECT_RELATIONSHIP_TYPES } from "./constants.ts";

// Pure daily-attention derivation for a Relationship's nearest open
// action. Never stored — computed fresh the same way
// getWellnessWatchSummaryByResident() derives Wellness Watch (see
// lib/data/wellnessFollowUps.ts): a flag that could go stale the moment
// it's written is worse than no flag at all.
//
// Timezone: day-precision boundaries (overdue vs. due today vs. due this
// week) use getCentralDayBoundaryUtc() — this app's one established
// Central-time day-boundary helper, already used identically for wellness
// follow-up dashboard counts (lib/data/wellnessFollowUps.ts,
// getWellnessFollowUpDashboardCounts()). "This week" means the 7-day
// window starting tomorrow (Central), matching that same function's
// dueThisWeek bucket exactly, not an ISO calendar week.
export type RelationshipAttentionStatus =
  | "overdue"
  | "due_today"
  | "due_this_week"
  | "upcoming"
  | "no_next_action"
  | "on_hold"
  | "closed";

export interface RelationshipAttentionInput {
  status: RelationshipStatus;
  relationshipType: RelationshipType;
  // ISO due_at of the relationship's nearest OPEN action, or null if an
  // open action exists with no due date, or undefined if there is no
  // open action at all.
  nearestOpenActionDueAt?: string | null;
}

export function getRelationshipAttentionStatus(
  input: RelationshipAttentionInput,
  now: Date = new Date()
): RelationshipAttentionStatus {
  if (input.status === "closed") return "closed";
  if (input.status === "on_hold") return "on_hold";

  const hasOpenAction = input.nearestOpenActionDueAt !== undefined;

  if (!hasOpenAction) {
    return PROSPECT_RELATIONSHIP_TYPES.includes(input.relationshipType)
      ? "no_next_action"
      : "upcoming";
  }

  if (!input.nearestOpenActionDueAt) return "upcoming";

  const dueAtMs = new Date(input.nearestOpenActionDueAt).getTime();
  const startOfTodayCentral = getCentralDayBoundaryUtc(-1, now).getTime();
  const endOfTodayCentral = getCentralDayBoundaryUtc(0, now).getTime();
  const endOfWeekCentral = getCentralDayBoundaryUtc(7, now).getTime();

  if (dueAtMs < startOfTodayCentral) return "overdue";
  if (dueAtMs < endOfTodayCentral) return "due_today";
  if (dueAtMs < endOfWeekCentral) return "due_this_week";
  return "upcoming";
}

export const RELATIONSHIP_ATTENTION_LABELS: Record<RelationshipAttentionStatus, string> = {
  overdue: "Overdue",
  due_today: "Due Today",
  due_this_week: "Due This Week",
  upcoming: "Upcoming",
  no_next_action: "No Next Action",
  on_hold: "On Hold",
  closed: "Closed",
};
