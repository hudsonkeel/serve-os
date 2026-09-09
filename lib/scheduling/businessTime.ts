// Serve business civil-time conventions for Visit reporting windows.
// Reuses lib/utils/date.ts's getCentralDayBoundaryUtc() (already DST-aware
// via Intl-derived offset calculation) rather than duplicating timezone
// math — this module only adds the "business date(s) -> UTC window"
// framing that metric/sync code actually needs.
//
// Why this exists: the live validation
// (docs/intelligence/SERVE_VISIT_INTELLIGENCE_LIVE_VALIDATION.md §10)
// found a real discrepancy between AxisCare's Central-civil-date visit
// fetch and a naive UTC calendar-day metric query. AxisCare's date
// parameters (see lib/integrations/axiscare/visits.ts) are already
// correctly Central-date-shaped on the fetch side; this module is what
// the READ side (querying historical_facts by occurred_at) was missing.
import { getCentralDayBoundaryUtc } from "../utils/date.ts";

export const SERVE_BUSINESS_TIME_ZONE = "America/Chicago";

export interface BusinessDateWindow {
  // Inclusive start, exclusive end — a half-open UTC interval covering
  // exactly the given business-date range's Central calendar days.
  readonly startUtc: string;
  readonly endUtcExclusive: string;
}

function parseBusinessDate(businessDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(businessDate);
  if (!match) {
    throw new Error(`Invalid business date "${businessDate}" — expected YYYY-MM-DD.`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// Anchored at UTC noon on the given calendar date — safe from ever
// rolling into an adjacent Central calendar day when converted (Central
// is UTC-5/UTC-6, so noon UTC is always 6am-7am local, same date).
function noonUtcAnchor(businessDate: string): Date {
  const { year, month, day } = parseBusinessDate(businessDate);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

// The UTC instant marking the start of `businessDate`'s Central calendar
// day (inclusive lower bound).
function businessDateStartUtc(businessDate: string): Date {
  // getCentralDayBoundaryUtc(-1, anchor) = start of anchor's own Central
  // day (see that function's doc comment: daysFromToday=0 gives the START
  // of the NEXT day, so -1 gives the start of the anchor's own day).
  return getCentralDayBoundaryUtc(-1, noonUtcAnchor(businessDate));
}

// The UTC instant marking the start of the Central calendar day AFTER
// `businessDate` (exclusive upper bound for "through the end of businessDate").
function businessDateEndExclusiveUtc(businessDate: string): Date {
  return getCentralDayBoundaryUtc(0, noonUtcAnchor(businessDate));
}

// One business date's full Central calendar day, as a UTC window.
export function businessDateToUtcWindow(businessDate: string): BusinessDateWindow {
  return {
    startUtc: businessDateStartUtc(businessDate).toISOString(),
    endUtcExclusive: businessDateEndExclusiveUtc(businessDate).toISOString(),
  };
}

// An inclusive [startDate, endDate] business-date range's full Central
// calendar days, as one contiguous UTC window.
export function businessDateRangeToUtcWindow(startDate: string, endDate: string): BusinessDateWindow {
  return {
    startUtc: businessDateStartUtc(startDate).toISOString(),
    endUtcExclusive: businessDateEndExclusiveUtc(endDate).toISOString(),
  };
}

// The Central calendar business date (YYYY-MM-DD) a UTC instant falls on
// — the inverse direction, e.g. for labeling a Fact with "which business
// day does this belong to."
export function utcInstantToBusinessDate(iso: string): string {
  const date = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SERVE_BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Calendar-only arithmetic (no timezone conversion involved — Central
// civil dates advance by exactly one calendar day regardless of a DST
// wall-clock jump on that day) — used by the rolling sync to compute a
// lookback window's start date from today's Central business date.
export function businessDateDaysBefore(businessDate: string, days: number): string {
  const { year, month, day } = parseBusinessDate(businessDate);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
