import "server-only";
import { axisCareGet } from "./client.ts";
import { normalizeCollection } from "./discovery.ts";
import { validateNextPageUrl } from "./visits.ts";
import { getAxisCareConfig } from "./config.ts";
import type {
  AxisCareAdlsResponse,
  AxisCareAdlCategoriesResponse,
} from "./types.ts";

// Both paths confirmed by AxisCare's public OpenAPI specification.
const ADLS_PATH = "/api/adls";
const ADL_CATEGORIES_PATH = "/api/adls/categories";

// Envelope is results.data (not results.adls) per the spec — deliberately
// different from every other list endpoint in this integration.
// limit=1: smallest supported page, per the spec's documented 1-500 range
// (default 100).
export async function getAdlSample() {
  return axisCareGet<AxisCareAdlsResponse>(ADLS_PATH, { limit: "1" });
}

// No limit/pagination parameters in the spec — this returns the agency's
// full ADL category list (a small, largely static reference set) in one
// response.
export async function getAdlCategorySample() {
  return axisCareGet<AxisCareAdlCategoriesResponse>(ADL_CATEGORIES_PATH);
}

// ADL definition catalog fetch (ADL automation mapping) — getAdlSample() above is deliberately
// a 1-record discovery probe; this is the agency's actual configured ADL definitions, the real
// IDs a deterministic Serve-facts-to-ADL mapper must resolve against, never invented. Mirrors
// getAllClients()'s bounded pagination discipline exactly (clients.ts).
const ADLS_PAGE_LIMIT = "100";
const MAX_ADL_PAGES = 10;
const MAX_TOTAL_ADLS = 1000;

export interface AllAdlsResult {
  records: unknown[];
  statusCode: number;
  truncated: boolean;
}

export async function getAllConfiguredAdls(): Promise<AllAdlsResult> {
  const config = getAxisCareConfig();

  const first = await axisCareGet<AxisCareAdlsResponse>(ADLS_PATH, { limit: ADLS_PAGE_LIMIT });

  const records: unknown[] = [];
  let pageCount = 1;
  let truncated = false;

  const firstCollection = normalizeCollection(first.body.results?.data);
  records.push(...firstCollection.records);

  let nextPageRaw: unknown = first.body.results?.nextPage;

  while (pageCount < MAX_ADL_PAGES) {
    const pathWithQuery = validateNextPageUrl(nextPageRaw, config.baseUrl);
    if (!pathWithQuery) break;

    if (records.length >= MAX_TOTAL_ADLS) {
      truncated = true;
      break;
    }

    const next = await axisCareGet<AxisCareAdlsResponse>(pathWithQuery);
    const nextCollection = normalizeCollection(next.body.results?.data);
    records.push(...nextCollection.records);
    pageCount += 1;
    nextPageRaw = next.body.results?.nextPage;
  }

  if (pageCount >= MAX_ADL_PAGES && validateNextPageUrl(nextPageRaw, config.baseUrl)) {
    truncated = true;
  }

  return { records, statusCode: first.statusCode, truncated };
}
