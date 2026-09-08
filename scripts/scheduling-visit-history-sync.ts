// Local, server-only entry point for Historical Visit Fact ingestion
// (lib/scheduling/visitFactsSync.ts). Prints only sanitized counters —
// never a resident/caregiver name, id, or payload value. Run with:
//
//   npm run scheduling:sync-visit-history
//   npm run scheduling:sync-visit-history -- --start=2026-09-01 --end=2026-09-07
//
// which expands to:
//
//   node --env-file-if-exists=.env.local --experimental-strip-types
//        --conditions=react-server scripts/scheduling-visit-history-sync.ts
//
// With no --start/--end, defaults to a 3-day trailing window ending today
// (Central Time) — routine forward-accumulation usage. A wider explicit
// range performs a bounded historical backfill through the exact same
// code path (see visitFactsSync.ts's module comment).
//
// This is a manual/local entry point only — no production API route or
// scheduled cron trigger has been wired yet (deliberately deferred; see
// the pre-commit report for this phase).
import { syncHistoricalVisitFacts } from "../lib/scheduling/visitFactsSync.ts";
import { todaysDateStringCentral } from "../lib/integrations/axiscare/centralDate.ts";

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function daysAgoDateString(days: number): string {
  const today = new Date(`${todaysDateStringCentral()}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - days);
  return today.toISOString().slice(0, 10);
}

async function main() {
  console.log("Scheduling Intelligence — Historical Visit Fact Sync");
  console.log("=====================================================");
  console.log("");

  const startDate = parseArg("start") ?? daysAgoDateString(3);
  const endDate = parseArg("end") ?? todaysDateStringCentral();

  console.log(`Date range: ${startDate} to ${endDate} (inclusive, Central Time)`);
  console.log("");

  const result = await syncHistoricalVisitFacts(startDate, endDate);

  if (!result.available) {
    console.log(`Unavailable: ${result.reason}`);
    process.exit(1);
  }

  console.log(`Fetched:                     ${result.fetched}`);
  console.log(`Normalized:                  ${result.normalized}`);
  console.log(`Skipped (unresolved client): ${result.skippedUnresolvedIdentity}`);
  console.log(`Skipped (no occurrence time):${result.skippedNoOccurrenceTime}`);
  console.log(`Inserted new Facts:          ${result.insertedNew}`);
  console.log(`Inserted superseding Facts:  ${result.insertedSuperseding}`);
  console.log(`Unchanged (no-op):           ${result.unchanged}`);
  console.log(`Errors:                      ${result.errors}`);
  console.log(`Truncated (bound hit):       ${result.truncated}`);

  if (result.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected sync failure:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
