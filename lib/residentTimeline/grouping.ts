import type { ResidentTimelineEvent } from "@/lib/supabase/types";
import { groupEventsByDay, type DayGroup } from "../utils/timelineGrouping.ts";

// Resident-typed wrapper around the generic day-grouping helper (see
// lib/utils/timelineGrouping.ts) — kept here so the existing import path
// and tests for Resident Timeline don't change.

export type TimelineDayGroup = DayGroup<ResidentTimelineEvent>;

export function groupTimelineEventsByDay(
  events: ResidentTimelineEvent[],
  referenceDate: Date = new Date()
): TimelineDayGroup[] {
  return groupEventsByDay(events, (event) => event.createdAt, referenceDate);
}
