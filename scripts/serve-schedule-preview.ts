// Optional, sanitized local-only preview of the normalized Serve schedule
// model against live AxisCare data. Prints ONLY: date, availability,
// aggregate counts, aggregate time-parsing metadata, and normalized field
// names (from the TypeScript type itself, not from data) — never
// resident/caregiver names, visit IDs, or any raw/per-visit timestamp.
//
// Run with (do not omit any flag):
//
//   npm run schedule:preview
//
// which expands to:
//
//   node --env-file-if-exists=.env.local --experimental-strip-types
//        --conditions=react-server scripts/serve-schedule-preview.ts
//
// See scripts/axiscare-discovery.ts for why --conditions=react-server is
// required (import "server-only" in the modules this script depends on).
import { getAxisCareTodaysSchedule } from "../lib/scheduling/todaysSchedule.ts";
import type { ServeScheduleVisit } from "../lib/scheduling/types.ts";

const PREVIEW_TIMEZONE = "America/Chicago";

function formatCentralTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PREVIEW_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// Aggregate-only — never returns or logs which visit a min/max came from,
// only the resulting instant.
function earliestIso(values: string[]): string | null {
  return values.length > 0
    ? values.reduce((min, v) => (v < min ? v : min))
    : null;
}
function latestIso(values: string[]): string | null {
  return values.length > 0
    ? values.reduce((max, v) => (v > max ? v : max))
    : null;
}

function printTimeMetadata(activeVisits: ServeScheduleVisit[]) {
  const withScheduledStart = activeVisits.filter((v) => v.scheduledStart !== "");
  const withScheduledEnd = activeVisits.filter((v) => v.scheduledEnd !== "");
  const withActualStart = activeVisits.filter((v) => v.actualStart !== null);
  const withActualEnd = activeVisits.filter((v) => v.actualEnd !== null);
  const withUnparseableScheduledTimes = activeVisits.filter(
    (v) => v.scheduledStart === "" || v.scheduledEnd === ""
  );

  const usingAxisCareTimezone = activeVisits.filter((v) => v.timezone !== null);
  const usingCentralFallback = activeVisits.filter((v) => v.timezone === null);
  const distinctTimezones = [...new Set(activeVisits.map((v) => v.timezone).filter((tz): tz is string => tz !== null))].sort();

  const earliestStart = earliestIso(withScheduledStart.map((v) => v.scheduledStart));
  const latestEnd = latestIso(withScheduledEnd.map((v) => v.scheduledEnd));

  console.log("Date/Time Validation (Part D)");
  console.log("------------------------------");
  console.log(`activeVisitsWithParsedScheduledStart: ${withScheduledStart.length}`);
  console.log(`activeVisitsWithParsedScheduledEnd:    ${withScheduledEnd.length}`);
  console.log(`activeVisitsWithActualStart:           ${withActualStart.length}`);
  console.log(`activeVisitsWithActualEnd:             ${withActualEnd.length}`);
  console.log(
    `earliestActiveScheduledStart:          ${earliestStart ? formatCentralTime(earliestStart) + " CT" : "n/a"}`
  );
  console.log(
    `latestActiveScheduledEnd:              ${latestEnd ? formatCentralTime(latestEnd) + " CT" : "n/a"}`
  );
  console.log(`distinctSourceTimezones:               ${distinctTimezones.join(", ") || "(none)"}`);
  console.log(`countUsingAxisCareTimezone:            ${usingAxisCareTimezone.length}`);
  console.log(`countUsingAmericaChicagoFallback:       ${usingCentralFallback.length}`);
  console.log(`countWithUnparseableScheduledTimes:     ${withUnparseableScheduledTimes.length}`);
  console.log("");
}

async function main() {
  console.log("Serve Schedule Preview");
  console.log("======================");
  console.log("");

  const result = await getAxisCareTodaysSchedule();

  console.log(`operationalDate: ${result.operationalDate}`);
  console.log(`fetchedAt:       ${result.fetchedAt}`);
  console.log(`available:       ${result.available}`);
  console.log("");

  if (!result.available) {
    console.log(`reason:          ${result.reason}`);
    console.log(`safeMessage:     ${result.safeMessage}`);
    process.exitCode = result.reason === "not_configured" ? 1 : 0;
    return;
  }

  console.log("Summary (Part A)");
  console.log("-----------------");
  console.log(`sourceRecordCount:    ${result.summary.sourceRecordCount}`);
  console.log(`activeVisitCount:     ${result.summary.activeVisitCount}`);
  console.log(`removedVisitCount:    ${result.summary.removedVisitCount}`);
  console.log(`activeAssignedCount:  ${result.summary.activeAssignedCount}`);
  console.log(`activeUnassignedCount:${result.summary.activeUnassignedCount}`);
  console.log(`scheduledCount:       ${result.summary.scheduledCount}`);
  console.log(`inProgressCount:      ${result.summary.inProgressCount}`);
  console.log(`completedCount:       ${result.summary.completedCount}`);
  console.log(`missedCount:          ${result.summary.missedCount}`);
  console.log(`unknownCount:         ${result.summary.unknownCount}`);
  console.log(`hasNextPage:          ${result.pagination.hasNextPage}`);
  console.log("");

  printTimeMetadata(result.activeVisits);

  console.log("scheduled* vs. start/end Field-Pair Comparison (Part E)");
  console.log("---------------------------------------------------------");
  console.log(`recordsWithBothPairsPresent:   ${result.timeFieldAudit.recordsWithBothPairsPresent}`);
  console.log(`recordsWithBothPairsParsed:    ${result.timeFieldAudit.recordsWithBothPairsParsed}`);
  console.log(`recordsWithDifferingInstants:  ${result.timeFieldAudit.recordsWithDifferingInstants}`);
  console.log(
    `minAbsoluteDifferenceMinutes:  ${result.timeFieldAudit.minAbsoluteDifferenceMinutes ?? "n/a"}`
  );
  console.log(
    `maxAbsoluteDifferenceMinutes:  ${result.timeFieldAudit.maxAbsoluteDifferenceMinutes ?? "n/a"}`
  );
  console.log("");

  // Field names only — this is the fixed ServeScheduleVisit shape, not
  // anything read from the data itself, so it's identical regardless of
  // which visits came back. Printed only as a quick sanity check that
  // normalization actually ran and produced records.
  if (result.activeVisits.length > 0) {
    console.log("Normalized field names present on each active visit:");
    console.log(`  ${Object.keys(result.activeVisits[0]).sort().join(", ")}`);
  } else {
    console.log("No active visits normalized for today.");
  }
}

main().catch((err) => {
  console.error(
    "Unexpected schedule preview failure:",
    err instanceof Error ? err.message : "unknown error"
  );
  process.exit(1);
});
