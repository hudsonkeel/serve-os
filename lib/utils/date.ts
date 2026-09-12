export const CENTRAL_TIME_ZONE = "America/Chicago";

function centralOffsetMinutes(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CENTRAL_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * Returns the true UTC instant marking the start of the Central-time
 * calendar day that is `daysFromToday` days after `referenceDate`'s Central
 * calendar day — i.e. an exclusive upper bound for "due on or before the end
 * of that Central day". Handles the CST/CDT transition correctly since the
 * offset is computed from the actual date in question.
 *
 * Example: getCentralDayBoundaryUtc(0) is "midnight tonight, Central time,
 * converted to UTC" — anything with due_at < this value is due today or
 * earlier (Central); anything >= this value is due tomorrow or later.
 */
export function getCentralDayBoundaryUtc(
  daysFromToday: number,
  referenceDate = new Date()
): Date {
  const offsetMinutes = centralOffsetMinutes(referenceDate);
  const centralWallClock = new Date(referenceDate.getTime() + offsetMinutes * 60_000);

  const year = centralWallClock.getUTCFullYear();
  const month = centralWallClock.getUTCMonth();
  const day = centralWallClock.getUTCDate();

  const nextDayCentralWallClock = Date.UTC(year, month, day + daysFromToday + 1);
  return new Date(nextDayCentralWallClock - offsetMinutes * 60_000);
}

export function formatCentralDashboardDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(date)
    .toUpperCase();
}

// "Aug 14, 2026 at 2:07 PM" — Central time, same locale/timezone
// convention as the rest of this file. Used for point-in-time timestamps
// (e.g. "Last successful sync") where a bare clock time or relative
// "X ago" phrasing would be ambiguous across days.
export function formatCentralDateTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${datePart} at ${timePart}`;
}

// ─── Business calendar dates (SQL `date` columns — no time-of-day) ────────
//
// A `date` column (compliance_corrective_actions.due_at,
// corrective_action_effectiveness_reviews.due_at, person_evidence.expiration_date,
// etc.) already IS the exact calendar day Serve means — "due Sep 24" needs
// no timezone interpretation at all, since there is no time-of-day to
// convert. Parsing it as a UTC instant (`new Date("2026-09-24")` is
// midnight UTC) and then converting THAT instant into America/Chicago (or
// into whatever timezone the runtime happens to default to — the second,
// independently-confirmed bug: Node's Intl.DateTimeFormat with no explicit
// timeZone silently uses the process's local timezone) rolls the date back
// a full day for Serve's own Central-time operation. These functions never
// construct a UTC instant from a date-only value; they only ever
// compare/format its raw YYYY-MM-DD components directly. `now` (a genuine
// instant) is the only value that legitimately needs a timezone
// conversion, since it's the one side of the comparison that actually is
// an instant rather than a calendar date.
//
// isBusinessDateOnly() lets a caller that receives either shape (an
// already-fetched WorkItem.dueAt, which may be a `date` or a `timestamptz`
// column depending on its source) auto-detect which handling applies,
// without needing a second field threaded through every mapper to say so
// — PostgREST/supabase-js always serializes a `date` column as a bare
// YYYY-MM-DD string and a `timestamptz` column as a full ISO instant, so
// the string shape itself is a reliable signal.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isBusinessDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function businessDateDayNumber(dateOnly: string): number {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

// "What Central-time calendar date is it right now" — the one legitimate
// instant-to-timezone conversion in this section.
function centralCalendarDayNumber(now: Date): number {
  return businessDateDayNumber(new Intl.DateTimeFormat("en-CA", { timeZone: CENTRAL_TIME_ZONE }).format(now));
}

export function isBusinessDateOverdue(dateOnly: string, now: Date = new Date()): boolean {
  return businessDateDayNumber(dateOnly) < centralCalendarDayNumber(now);
}

export function isBusinessDateDueTodayOrEarlier(dateOnly: string, now: Date = new Date()): boolean {
  return businessDateDayNumber(dateOnly) <= centralCalendarDayNumber(now);
}

// "Sep 24, 2026" (year defaults on — pass includeYear: false for "Sep 24",
// the compact form Today's Work's row/explanation text uses) for a plain
// calendar date — see the section header above for why this never routes
// through a UTC-instant conversion. The one shared implementation behind
// every date-only consumer in this codebase (lib/workspace/mapping.ts's
// formatDate, components/workspace/WorkItemRow.tsx's formatDueDate, and
// direct incident/corrective-action UI callers) — never a second,
// independently-written date-only formatter.
export function formatPlainDate(
  dateStr: string,
  options: { monthStyle?: "short" | "long"; includeYear?: boolean } = {}
): string | null {
  const { monthStyle = "short", includeYear = true } = options;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: monthStyle,
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

export function getCentralTimeGreeting(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CENTRAL_TIME_ZONE,
      hour: "numeric",
      hour12: false,
    }).format(date)
  );

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
