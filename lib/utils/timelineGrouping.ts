// Generic day-grouping logic shared by every Timeline UI in this app
// (Resident Timeline, Relationship Timeline). Originally lived only in
// lib/residentTimeline/grouping.ts; generalized here so Relationship
// Timeline doesn't duplicate the same Central-time bucketing logic — see
// lib/residentTimeline/grouping.ts, which now just re-exports a thin
// resident-typed wrapper around this for backward compatibility with its
// existing tests and consumer.

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

export interface DayGroup<T> {
  label: string;
  events: T[];
}

// Takes a `getCreatedAt` extractor rather than assuming a fixed field
// name, since Timeline event types in this app aren't uniformly cased —
// Resident Timeline's TS type is camelCase (createdAt, transformed from
// the DB row), Relationship Timeline's is a direct snake_case passthrough
// (created_at). Assumes `events` is already sorted most-recent-first (the
// order every getXTimeline() function in this app returns) — consecutive
// same-day events are grouped together without re-sorting.
export function groupEventsByDay<T>(
  events: T[],
  getCreatedAt: (event: T) => string,
  referenceDate: Date = new Date()
): DayGroup<T>[] {
  const todayKey = centralDateKey(referenceDate.toISOString());
  const yesterdayKey = centralDateKey(
    new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
  );

  const groups: DayGroup<T>[] = [];
  let currentKey: string | null = null;

  for (const event of events) {
    const createdAt = getCreatedAt(event);
    const key = centralDateKey(createdAt);

    if (key !== currentKey) {
      const label =
        key === todayKey
          ? "Today"
          : key === yesterdayKey
            ? "Yesterday"
            : centralDisplayDate(createdAt);
      groups.push({ label, events: [] });
      currentKey = key;
    }

    groups[groups.length - 1].events.push(event);
  }

  return groups;
}
