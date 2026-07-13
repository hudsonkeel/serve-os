import type { AxisCareRawVisit } from "../integrations/axiscare/types.ts";
import { parseAxisCareDateTime, DEFAULT_TIMEZONE } from "./dateTime.ts";
import type { ServeTimeFieldAudit } from "./types.ts";

// Aggregate-only comparison of AxisCare's two visit date/time field pairs
// — scheduledStartDate/scheduledEndDate vs. startDate/endDate — used to
// validate (or correct) normalize.ts's choice to prefer the "scheduled"
// pair. Never returns or logs a per-record or raw value; every field on
// ServeTimeFieldAudit is a count or a duration in minutes.
//
// "Difference" per record is the LARGER of |scheduledStart - start| and
// |scheduledEnd - end| in minutes — one number per record, not two, so
// min/max/nonzero-count all describe the same well-defined per-record
// quantity. Min/max are computed only across records with a nonzero
// difference; if every record's pairs agree exactly (or no record has
// both pairs), both are null rather than a misleading 0.
export function auditScheduledVsStartEndFields(
  rawVisits: AxisCareRawVisit[]
): ServeTimeFieldAudit {
  let bothPairsPresent = 0;
  let bothPairsParsed = 0;
  let differingInstants = 0;
  const nonZeroDifferencesMinutes: number[] = [];

  for (const raw of rawVisits) {
    const timezone = typeof raw.timezone === "string" && raw.timezone ? raw.timezone : DEFAULT_TIMEZONE;

    const scheduledStartRaw = raw.scheduledStartDate ?? null;
    const scheduledEndRaw = raw.scheduledEndDate ?? null;
    const startRaw = raw.startDate ?? null;
    const endRaw = raw.endDate ?? null;

    const bothPresent = Boolean(scheduledStartRaw && scheduledEndRaw && startRaw && endRaw);
    if (bothPresent) bothPairsPresent += 1;
    if (!bothPresent) continue;

    const scheduledStart = parseAxisCareDateTime(scheduledStartRaw, timezone);
    const scheduledEnd = parseAxisCareDateTime(scheduledEndRaw, timezone);
    const start = parseAxisCareDateTime(startRaw, timezone);
    const end = parseAxisCareDateTime(endRaw, timezone);

    const bothParsed = Boolean(scheduledStart && scheduledEnd && start && end);
    if (!bothParsed) continue;
    bothPairsParsed += 1;

    const startDiffMinutes =
      Math.abs(new Date(scheduledStart!).getTime() - new Date(start!).getTime()) / 60_000;
    const endDiffMinutes =
      Math.abs(new Date(scheduledEnd!).getTime() - new Date(end!).getTime()) / 60_000;
    const recordDiffMinutes = Math.max(startDiffMinutes, endDiffMinutes);

    if (recordDiffMinutes > 0) {
      differingInstants += 1;
      nonZeroDifferencesMinutes.push(recordDiffMinutes);
    }
  }

  return {
    recordsWithBothPairsPresent: bothPairsPresent,
    recordsWithBothPairsParsed: bothPairsParsed,
    recordsWithDifferingInstants: differingInstants,
    minAbsoluteDifferenceMinutes:
      nonZeroDifferencesMinutes.length > 0 ? Math.min(...nonZeroDifferencesMinutes) : null,
    maxAbsoluteDifferenceMinutes:
      nonZeroDifferencesMinutes.length > 0 ? Math.max(...nonZeroDifferencesMinutes) : null,
  };
}
