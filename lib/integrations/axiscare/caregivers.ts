import "server-only";
import { axisCareGet } from "./client.ts";
import { getAxisCareConfig } from "./config.ts";
import { normalizeCollection } from "./discovery.ts";
import { validateNextPageUrl } from "./visits.ts";
import type { AxisCareCaregiversResponse } from "./types.ts";

// Path confirmed by the AxisCare OpenAPI specification: /api/caregivers.
const CAREGIVERS_PATH = "/api/caregivers";

// Smallest supported page (limit=1) to inspect response structure only —
// not a full import of the caregiver roster, and does not depend on
// knowing an existing caregiver ID.
//
// Deliberately does NOT send `requestedSensitiveFields`. The token has
// Caregivers Read Sensitive scope, but this discovery spike has no need
// for SSNs, driver-license data, or other sensitive attributes — the
// field simply never appears in this request.
export async function getCaregiverSample() {
  return axisCareGet<AxisCareCaregiversResponse>(CAREGIVERS_PATH, {
    limit: "1",
  });
}

// ─── Bounded full-roster fetch (Workforce Intelligence Phase 1) ──────────
//
// Unlike getCaregiverSample(), this is meant to retrieve the whole active
// caregiver roster for the AxisCare sync — see
// lib/workforce/axiscareCaregiverSync.ts. Still bounded (a safety net
// against a runaway nextPage loop, same discipline as
// visits.ts's getTodaysVisitsBounded()), not because completeness isn't
// wanted here — a home-care agency's caregiver roster is expected to be at
// most a few hundred records, well inside these bounds.
//
// Deliberately does NOT send `requestedSensitiveFields` — same privacy
// posture as getCaregiverSample().
const CAREGIVERS_PAGE_LIMIT = "100";
const MAX_CAREGIVER_PAGES = 20;
const MAX_TOTAL_CAREGIVERS = 2000;

export interface AllCaregiversResult {
  // Every caregiver record across every page, already unwrapped from
  // AxisCare's keyed-by-ID envelope via normalizeCollection() — the map's
  // own keys (caregiver IDs) are never read into this list; each record's
  // own `id` field is what identifies it downstream.
  records: unknown[];
  statusCode: number;
  truncated: boolean;
}

export async function getAllCaregivers(): Promise<AllCaregiversResult> {
  const config = getAxisCareConfig();

  const first = await axisCareGet<AxisCareCaregiversResponse>(CAREGIVERS_PATH, {
    limit: CAREGIVERS_PAGE_LIMIT,
  });

  const records: unknown[] = [];
  let pageCount = 1;
  let truncated = false;

  const firstCollection = normalizeCollection(first.body.results?.caregivers);
  records.push(...firstCollection.records);

  let nextPageRaw: unknown = first.body.results?.nextPage;

  while (pageCount < MAX_CAREGIVER_PAGES) {
    const pathWithQuery = validateNextPageUrl(nextPageRaw, config.baseUrl);
    if (!pathWithQuery) break;

    if (records.length >= MAX_TOTAL_CAREGIVERS) {
      truncated = true;
      break;
    }

    const next = await axisCareGet<AxisCareCaregiversResponse>(pathWithQuery);
    const nextCollection = normalizeCollection(next.body.results?.caregivers);
    records.push(...nextCollection.records);
    pageCount += 1;
    nextPageRaw = next.body.results?.nextPage;
  }

  if (pageCount >= MAX_CAREGIVER_PAGES && validateNextPageUrl(nextPageRaw, config.baseUrl)) {
    truncated = true;
  }

  return { records, statusCode: first.statusCode, truncated };
}
