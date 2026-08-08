import "server-only";
import { axisCareGet } from "./client.ts";
import { getAxisCareConfig } from "./config.ts";
import { normalizeCollection } from "./discovery.ts";
import { validateNextPageUrl } from "./visits.ts";

// AxisCare's Leads CRM layer — live-confirmed reachable and readable
// with the current token (a /api/leads?limit=1 probe returned real
// data; this was never previously used or documented anywhere in this
// codebase). Read-only: this module has no write capability, matching
// every other AxisCare integration file in this codebase.
const LEADS_PATH = "/api/leads";

export interface AxisCareRawLead {
  id?: string | number;
  [key: string]: unknown;
}

interface AxisCareLeadsResponse {
  results?: {
    leads?: unknown;
    nextPage?: string | number | null;
    [key: string]: unknown;
  };
  errors?: unknown[];
  success?: boolean;
  [key: string]: unknown;
}

// Bounded full fetch, mirroring getAllClients()'s pagination discipline
// exactly (lib/integrations/axiscare/clients.ts).
const LEADS_PAGE_LIMIT = "100";
const MAX_LEAD_PAGES = 20;
const MAX_TOTAL_LEADS = 2000;

export interface AllLeadsResult {
  records: unknown[];
  statusCode: number;
  truncated: boolean;
}

export async function getAllLeads(): Promise<AllLeadsResult> {
  const config = getAxisCareConfig();

  const first = await axisCareGet<AxisCareLeadsResponse>(LEADS_PATH, { limit: LEADS_PAGE_LIMIT });

  const records: unknown[] = [];
  let pageCount = 1;
  let truncated = false;

  const firstCollection = normalizeCollection(first.body.results?.leads);
  records.push(...firstCollection.records);

  let nextPageRaw: unknown = first.body.results?.nextPage;

  while (pageCount < MAX_LEAD_PAGES) {
    const pathWithQuery = validateNextPageUrl(nextPageRaw, config.baseUrl);
    if (!pathWithQuery) break;

    if (records.length >= MAX_TOTAL_LEADS) {
      truncated = true;
      break;
    }

    const next = await axisCareGet<AxisCareLeadsResponse>(pathWithQuery);
    const nextCollection = normalizeCollection(next.body.results?.leads);
    records.push(...nextCollection.records);
    pageCount += 1;
    nextPageRaw = next.body.results?.nextPage;
  }

  if (pageCount >= MAX_LEAD_PAGES && validateNextPageUrl(nextPageRaw, config.baseUrl)) {
    truncated = true;
  }

  return { records, statusCode: first.statusCode, truncated };
}
