import "server-only";
import { axisCareGet } from "./client.ts";
import { normalizeCollection } from "./discovery.ts";
import { validateNextPageUrl } from "./visits.ts";
import { getAxisCareConfig } from "./config.ts";
import type { AxisCareClientsResponse } from "./types.ts";

// Path confirmed by the AxisCare OpenAPI specification: /api/clients.
const CLIENTS_PATH = "/api/clients";

// Smallest supported page (limit=1) to inspect response structure only —
// not a full import of the client roster, and does not depend on knowing
// an existing client ID.
//
// Deliberately does NOT send `requestedSensitiveFields`. The token has
// Clients Read Sensitive scope, but this discovery spike has no need for
// SSNs, driver-license data, or other sensitive attributes — the field
// simply never appears in this request.
export async function getClientSample() {
  return axisCareGet<AxisCareClientsResponse>(CLIENTS_PATH, { limit: "1" });
}

// ─── Bounded full-roster fetch (People We Serve reconciliation) ──────────
//
// Every prior reconciliation pass in this session fetched a single page
// (limit=100) without following results.nextPage — live-confirmed to
// still have returned the complete roster so far (25, then 26 records,
// nextPage: null both times), but that was luck, not a guarantee. This
// mirrors getAllCaregivers()'s bounded pagination discipline exactly
// (caregivers.ts) so a future larger client roster can't silently go
// unfetched.
//
// Deliberately does NOT send `requestedSensitiveFields` — same privacy
// posture as getClientSample().
const CLIENTS_PAGE_LIMIT = "100";
const MAX_CLIENT_PAGES = 20;
const MAX_TOTAL_CLIENTS = 2000;

export interface AllClientsResult {
  records: unknown[];
  statusCode: number;
  truncated: boolean;
}

export async function getAllClients(): Promise<AllClientsResult> {
  const config = getAxisCareConfig();

  const first = await axisCareGet<AxisCareClientsResponse>(CLIENTS_PATH, {
    limit: CLIENTS_PAGE_LIMIT,
  });

  const records: unknown[] = [];
  let pageCount = 1;
  let truncated = false;

  const firstCollection = normalizeCollection(first.body.results?.clients);
  records.push(...firstCollection.records);

  let nextPageRaw: unknown = first.body.results?.nextPage;

  while (pageCount < MAX_CLIENT_PAGES) {
    const pathWithQuery = validateNextPageUrl(nextPageRaw, config.baseUrl);
    if (!pathWithQuery) break;

    if (records.length >= MAX_TOTAL_CLIENTS) {
      truncated = true;
      break;
    }

    const next = await axisCareGet<AxisCareClientsResponse>(pathWithQuery);
    const nextCollection = normalizeCollection(next.body.results?.clients);
    records.push(...nextCollection.records);
    pageCount += 1;
    nextPageRaw = next.body.results?.nextPage;
  }

  if (pageCount >= MAX_CLIENT_PAGES && validateNextPageUrl(nextPageRaw, config.baseUrl)) {
    truncated = true;
  }

  return { records, statusCode: first.statusCode, truncated };
}
