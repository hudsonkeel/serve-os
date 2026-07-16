import type { ResidentTimelineEvent } from "@/lib/supabase/types";

// Pure day-grouping logic for the Resident Timeline UI
// (components/residents/ResidentTimeline.tsx) — kept separate so it can be
// unit tested without React or a DOM.

const CENTRAL_TIME_ZONE = "America/Chicago";

// en-CA formats as YYYY-MM-DD, a stable sortable/comparable day key.
function centralDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CENTRAL_TIME_ZONE }).format(
    new Date(iso)
  );
}

function centralDisplayDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export interface TimelineDayGroup {
  label: string;
  events: ResidentTimelineEvent[];
}

// Assumes `events` is already sorted most-recent-first (the order
// getResidentTimeline() returns) — consecutive same-day events are grouped
// together without re-sorting.
export function groupTimelineEventsByDay(
  events: ResidentTimelineEvent[],
  referenceDate: Date = new Date()
): TimelineDayGroup[] {
  const todayKey = centralDateKey(referenceDate.toISOString());
  const yesterdayKey = centralDateKey(
    new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
  );

  const groups: TimelineDayGroup[] = [];
  let currentKey: string | null = null;

  for (const event of events) {
    const key = centralDateKey(event.createdAt);

    if (key !== currentKey) {
      const label =
        key === todayKey
          ? "Today"
          : key === yesterdayKey
            ? "Yesterday"
            : centralDisplayDate(event.createdAt);
      groups.push({ label, events: [] });
      currentKey = key;
    }

    groups[groups.length - 1].events.push(event);
  }

  return groups;
}
