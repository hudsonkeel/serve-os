import "server-only";
import { axisCareGet } from "./client.ts";
import { getAxisCareConfig } from "./config.ts";
import { todaysDateStringCentral } from "./centralDate.ts";
import type { AxisCareVisitsResponse } from "./types.ts";

// Path confirmed by the AxisCare OpenAPI specification and live-verified:
// /api/visits under the site's server origin (AXISCARE_API_BASE_URL, e.g.
// https://16282.axiscare.com — no /api suffix on the base URL itself).
// First live discovery run: HTTP 200, 11 records, envelope results.visits.
const VISITS_PATH = "/api/visits";

// AxisCare requires startDate and endDate (both YYYY-MM-DD, Central Time)
// unless updatedSinceDate is used instead — this integration deliberately
// does not use updatedSinceDate. Both parameters must be the SAME calendar
// date for a today-only request.
//
// Fetches only today's visits (Central Time) — the smallest practical
// range for schedule visibility. Does not retrieve unlimited history.
export async function getTodaysVisits() {
  const today = todaysDateStringCentral();
  return axisCareGet<AxisCareVisitsResponse>(VISITS_PATH, {
    startDate: today,
    endDate: today,
  });
}

// Fetches visits for an arbitrary [startDate, endDate] range (YYYY-MM-DD,
// Central Time, inclusive) — the Historical Visit Fact ingestion path's
// entry point (lib/scheduling/visitFactsSync.ts). Same VISITS_PATH and
// query-parameter contract as getTodaysVisits(), generalized to a caller-
// supplied range rather than hardcoding "today".
export async function getVisitsForDateRange(startDate: string, endDate: string) {
  return axisCareGet<AxisCareVisitsResponse>(VISITS_PATH, { startDate, endDate });
}

// ─── Bounded pagination ──────────────────────────────────────────────────
//
// Live discovery observed results.nextPage on the visits envelope (11
// records, single page in practice). This exists as a safety net for a
// busier day/range, not because a multi-page response has been confirmed
// to occur — see docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md.

const MAX_PAGES = 3;
const MAX_TOTAL_VISITS = 500;

// Historical ingestion (lib/scheduling/visitFactsSync.ts) may reasonably
// request a wider date range than "today" in one call (e.g. a rolling
// multi-day window or a bounded backfill), so it gets a higher pagination
// ceiling than the Today's Schedule path — still bounded, never unlimited.
const HISTORY_MAX_PAGES = 20;
const HISTORY_MAX_TOTAL_VISITS = 5000;

export interface TodaysVisitsPages {
  pages: AxisCareVisitsResponse[];
  statusCode: number;
  // true if pagination stopped due to hitting MAX_PAGES/MAX_TOTAL_VISITS
  // (or an unfollowable nextPage value) while AxisCare's own nextPage
  // still indicated more data was available.
  truncated: boolean;
}

// Validates a candidate results.nextPage value as a safe, followable
// AxisCare URL before ever fetching it: HTTPS, the same hostname as the
// configured base URL, and an /api path. A bare page number/cursor
// (whose construction convention isn't confirmed), a mismatched hostname,
// non-HTTPS, or a non-/api path all stop pagination rather than guess how
// to build the next request. Returns the path+query to pass to
// axisCareGet(), or null.
export function validateNextPageUrl(
  nextPage: unknown,
  expectedBaseUrl: string
): string | null {
  if (typeof nextPage !== "string" || !nextPage) return null;
  let candidate: URL;
  let expected: URL;
  try {
    candidate = new URL(nextPage);
    expected = new URL(expectedBaseUrl);
  } catch {
    return null;
  }
  if (candidate.protocol !== "https:") return null;
  if (candidate.hostname !== expected.hostname) return null;
  if (!candidate.pathname.startsWith("/api/")) return null;
  return `${candidate.pathname}${candidate.search}`;
}

function countVisitsOnPage(body: AxisCareVisitsResponse): number {
  return Array.isArray(body.results?.visits) ? body.results!.visits!.length : 0;
}

// Shared pagination loop behind both getTodaysVisitsBounded() and
// getVisitsForDateRangeBounded() — follows results.nextPage up to
// `maxPages`/`maxTotalVisits` rather than crawling unlimited pages, and
// only ever follows a nextPage value that passes validateNextPageUrl().
// Stops (without erroring) the moment nextPage is absent/null,
// unfollowable, or a bound would be exceeded.
async function fetchBoundedPages(
  first: { body: AxisCareVisitsResponse; statusCode: number },
  maxPages: number,
  maxTotalVisits: number
): Promise<TodaysVisitsPages> {
  const config = getAxisCareConfig();

  const pages: AxisCareVisitsResponse[] = [first.body];
  let totalVisits = countVisitsOnPage(first.body);
  let nextPageRaw: unknown = first.body.results?.nextPage;
  let truncated = false;

  while (pages.length < maxPages) {
    const pathWithQuery = validateNextPageUrl(nextPageRaw, config.baseUrl);
    if (!pathWithQuery) break;

    if (totalVisits >= maxTotalVisits) {
      truncated = true;
      break;
    }

    const next = await axisCareGet<AxisCareVisitsResponse>(pathWithQuery);
    pages.push(next.body);
    totalVisits += countVisitsOnPage(next.body);
    nextPageRaw = next.body.results?.nextPage;
  }

  if (pages.length >= maxPages && validateNextPageUrl(nextPageRaw, config.baseUrl)) {
    truncated = true;
  }

  return { pages, statusCode: first.statusCode, truncated };
}

export async function getTodaysVisitsBounded(): Promise<TodaysVisitsPages> {
  const first = await getTodaysVisits();
  return fetchBoundedPages(first, MAX_PAGES, MAX_TOTAL_VISITS);
}

// Historical Visit Fact ingestion's entry point — same bounded-pagination
// discipline as getTodaysVisitsBounded(), with a higher ceiling suited to
// a multi-day range (see HISTORY_MAX_PAGES/HISTORY_MAX_TOTAL_VISITS above).
export async function getVisitsForDateRangeBounded(
  startDate: string,
  endDate: string
): Promise<TodaysVisitsPages> {
  const first = await getVisitsForDateRange(startDate, endDate);
  return fetchBoundedPages(first, HISTORY_MAX_PAGES, HISTORY_MAX_TOTAL_VISITS);
}
