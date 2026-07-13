// Shared Central-Time (America/Chicago) calendar-date helper for
// AxisCare's date-only query parameters (Visits' and Schedules'
// startDate/endDate). No token or network access here — not server-only.
//
// Deliberately NOT derived from lib/utils/date.ts's
// getCentralDayBoundaryUtc(): that function returns exclusive UTC instant
// boundaries meant for range comparisons (e.g. "due before end of
// today"), not calendar-date *strings*. Naively slicing its ISO output
// would give the wrong date near the UTC/Central day boundary — Central
// time is always behind UTC, so e.g. 00:00 Central maps to 05:00-06:00
// UTC the same day, but the boundary for "end of today" maps to the
// *next* UTC day. Intl.DateTimeFormat's en-CA locale formats directly in
// the target time zone as YYYY-MM-DD, which is what a date-only query
// parameter actually needs. (This was a real bug in an earlier version of
// this integration — see docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md.)
export function todaysDateStringCentral(referenceDate = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
  }).format(referenceDate);
}
