import "server-only";
import {
  getAxisCareConfigurationState,
  type AxisCareConfigurationState,
} from "./config.ts";
import { AxisCareError, type AxisCareErrorCategory } from "./errors.ts";
import { getTodaysVisits } from "./visits.ts";
import { getScheduleSample } from "./schedules.ts";
import { getClientSample } from "./clients.ts";
import { getCaregiverSample } from "./caregivers.ts";
import { getApplicantSample } from "./applicants.ts";
import { getOrganizationSample } from "./organizations.ts";
import { getAdlSample, getAdlCategorySample } from "./adls.ts";
import { getTaggingCategorySample } from "./taggingCategories.ts";
import { getExpiringTokensSample } from "./expiringTokens.ts";

export type AxisCareEndpointName =
  | "visits"
  | "schedules"
  | "clients"
  | "caregivers"
  | "applicants"
  | "organizations"
  | "adls"
  | "adlCategories"
  | "taggingCategories"
  | "expiringTokens";

export type AxisCareCollectionShape =
  | "array"
  | "keyed_object"
  | "single_object"
  | "empty";

export interface AxisCareEndpointDiscovery {
  endpoint: AxisCareEndpointName;
  attempted: boolean;
  success: boolean;
  statusCode: number | null;
  recordCount: number | null;
  // Runtime shape of the collection actually found — live discovery
  // confirmed this varies by endpoint (caregivers: keyed_object; visits:
  // array). Useful input for the future ServeScheduleVisit mapping task.
  collectionShape: AxisCareCollectionShape | null;
  topLevelKeys: string[];
  // Keys one level inside `results` (e.g. ["visits","nextPage"] or
  // ["caregivers","caregiversNotFound","nextPage"]) — structural key
  // names only, never the contents of a keyed-by-ID map.
  resultsKeys: string[];
  sampleFieldNames: string[];
  pagination: {
    detected: boolean;
    fields: string[];
  };
  errorCategory: AxisCareErrorCategory | null;
  safeMessage: string | null;
}

export interface AxisCareDiscoveryResult {
  configuration: AxisCareConfigurationState;
  endpoints: AxisCareEndpointDiscovery[];
  // Field *names* only (e.g. "serviceType"), never values — see
  // findCinchProvenanceFieldNames(). Presence is not proof of CINCH
  // origin; see docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md.
  cinchProvenanceFieldNames: string[];
}

// AxisCare's real list-response shape, per the supplied OpenAPI spec and
// live discovery: the collection lives at results.<resourceKey>, and
// pagination is results.nextPage — not a top-level field. "schedules" is
// a best-effort guess (see types.ts); the other three are confirmed.
const RESOURCE_KEY_BY_ENDPOINT: Record<AxisCareEndpointName, string> = {
  visits: "visits",
  schedules: "schedules",
  clients: "clients",
  caregivers: "caregivers",
  applicants: "applicants",
  organizations: "organizations",
  // Per the spec, both ADL endpoints nest their collection under
  // results.data, not results.adls / results.adlCategories.
  adls: "data",
  adlCategories: "data",
  // Per the spec, results.categories, not results.taggingCategories.
  taggingCategories: "categories",
  expiringTokens: "expiringTokens",
};

// Generic fallback candidates only — used when the known results.<key>
// shape doesn't match, so an unexpected response shape is still visible
// in discovery output rather than silently reported as "no pagination."
const PAGINATION_KEY_CANDIDATES = [
  "pagination",
  "meta",
  "page",
  "pageSize",
  "totalCount",
  "totalPages",
  "nextPage",
  "hasMore",
  "next",
  "cursor",
  "links",
];

// Field-name substrings that would indicate a visit or client record
// carries some notion of service type, program, branch, or
// external-system origin — exactly the kind of field CINCH-originated
// community-care visits would need to be distinguishable by. Matching a
// name here means "this field exists," nothing about its value, and
// nothing about whether any given record actually originated from CINCH.
// Live discovery observed both `service.code` (on visits) and
// `community` (on client records) — neither currently proves CINCH
// origin on its own; see the CINCH Provenance section of the integration
// doc for the planned verification method.
const CINCH_PROVENANCE_KEYWORDS = [
  "servicetype",
  "visittype",
  "program",
  "branch",
  "sourcesystem",
  "source", // covers "source", "externalSource", "dataSource"
  "communitycare",
  "community",
  "track",
  "shortvisit",
  "externalsource",
  "integrationorigin",
  "origin",
  "servicecode",
  "location",
];

// Pure function — inspects object KEYS only. Never reads or returns a
// primitive value from the input beyond what's needed to decide whether to
// recurse (typeof / Array.isArray). Safe to run against real AxisCare
// responses containing PHI, because PHI lives in values, not key names.
export function extractFieldPaths(
  value: unknown,
  prefix = "",
  maxDepth = 2,
  depth = 0
): string[] {
  if (depth > maxDepth || value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    // Inspect only the shape of the first element, never iterate values.
    return value.length > 0
      ? extractFieldPaths(value[0], prefix, maxDepth, depth)
      : [];
  }

  const paths: string[] = [];
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path);
    const nested = (value as Record<string, unknown>)[key];
    if (nested && typeof nested === "object") {
      paths.push(...extractFieldPaths(nested, path, maxDepth, depth + 1));
    }
  }
  return paths;
}

function normalizeFieldName(name: string): string {
  return name.replace(/[_\-.\s]/g, "").toLowerCase();
}

// Only ever reports field *names* that exist — see the module-level
// comment on CINCH_PROVENANCE_KEYWORDS and Part H of the integration doc.
//
// Normalizes the FULL dotted path (not just the last segment) so a
// compound concept split across nesting — e.g. "service.code" or
// "service.procedureCode" — still matches a keyword like "servicecode".
// Matching only the last segment would miss exactly these spec-confirmed
// visit fields, which are the most likely place CINCH provenance would
// actually show up.
export function findCinchProvenanceFieldNames(fieldPaths: string[]): string[] {
  const matches = new Set<string>();
  for (const path of fieldPaths) {
    const normalized = normalizeFieldName(path);
    if (CINCH_PROVENANCE_KEYWORDS.some((kw) => normalized.includes(kw))) {
      matches.add(path);
    }
  }
  return [...matches];
}

export interface NormalizedCollection {
  records: unknown[];
  recordCount: number;
  collectionShape: AxisCareCollectionShape;
}

// Safely normalizes a found collection value into a record array,
// regardless of whether AxisCare returned an array, a lone object, or an
// object keyed by record ID (live-confirmed for caregivers; schedules and
// clients not yet confirmed to behave the same way, but this function
// handles all three uniformly so a future confirmation needs no code
// change here).
//
// CRITICAL: when the value is a keyed-by-ID object, this returns
// Object.values(...) as the records. The ID keys themselves are computed
// only to count them and decide the shape — they are never included in
// the returned records, never logged, and never otherwise surfaced by any
// caller of this function.
export function normalizeCollection(value: unknown): NormalizedCollection {
  if (Array.isArray(value)) {
    return {
      records: value,
      recordCount: value.length,
      collectionShape: value.length === 0 ? "empty" : "array",
    };
  }

  if (value && typeof value === "object") {
    const entries = Object.values(value as Record<string, unknown>);
    if (entries.length === 0) {
      return { records: [], recordCount: 0, collectionShape: "empty" };
    }

    const looksKeyedByRecords = entries.every(
      (entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry)
    );
    if (looksKeyedByRecords) {
      // recordCount intentionally computed from Object.values().length,
      // never Object.keys() — the count is identical either way, but this
      // makes it structurally impossible to accidentally return or log a
      // key (e.g. a caregiver ID) instead of a value.
      return {
        records: entries,
        recordCount: entries.length,
        collectionShape: "keyed_object",
      };
    }

    // Doesn't look like a map of records -> treat the object itself as a
    // single record.
    return { records: [value], recordCount: 1, collectionShape: "single_object" };
  }

  return { records: [], recordCount: 0, collectionShape: "empty" };
}

// Extracts the collection for a known AxisCare list endpoint. Per the
// supplied OpenAPI spec and live discovery, the real shape nests the
// collection inside `results`, keyed by resource name (results.visits,
// results.clients, results.caregivers; results.schedules is a
// best-effort assumption — see types.ts). Falls back to generic
// candidates (bare array, data, results, items) only when the known shape
// doesn't match, so an unexpected response shape is still visible rather
// than silently dropped.
export function extractCollection(
  body: unknown,
  resourceKey?: string
): NormalizedCollection | null {
  if (Array.isArray(body)) return normalizeCollection(body);
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  if (resourceKey && obj.results && typeof obj.results === "object") {
    const results = obj.results as Record<string, unknown>;
    if (resourceKey in results) {
      return normalizeCollection(results[resourceKey]);
    }
  }

  // Generic sanitized fallback for unexpected shapes.
  if (Array.isArray(obj.data)) return normalizeCollection(obj.data);
  if (Array.isArray(obj.results)) return normalizeCollection(obj.results);
  if (Array.isArray(obj.items)) return normalizeCollection(obj.items);
  return null;
}

// Detects pagination via the known results.nextPage field first (per the
// supplied spec), then falls back to generic top-level candidates for an
// unexpected shape. Does not follow the URL — detection only.
function detectPagination(body: unknown): { detected: boolean; fields: string[] } {
  const fields: string[] = [];
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (obj.results && typeof obj.results === "object") {
      const results = obj.results as Record<string, unknown>;
      if ("nextPage" in results) fields.push("results.nextPage");
    }
    for (const key of PAGINATION_KEY_CANDIDATES) {
      if (key in obj) fields.push(key);
    }
  }
  return { detected: fields.length > 0, fields };
}

function emptyDiscovery(endpoint: AxisCareEndpointName): AxisCareEndpointDiscovery {
  return {
    endpoint,
    attempted: false,
    success: false,
    statusCode: null,
    recordCount: null,
    collectionShape: null,
    topLevelKeys: [],
    resultsKeys: [],
    sampleFieldNames: [],
    pagination: { detected: false, fields: [] },
    errorCategory: null,
    safeMessage: null,
  };
}

// Turns one raw AxisCare response into sanitized discovery metadata. Never
// returns the response body, never returns field values, never returns
// the token, and — critically for the caregivers keyed-object shape —
// never returns a record's outer map key (e.g. a caregiver ID) anywhere.
// topLevelKeys/resultsKeys naturally surface `errors`, `success`, and
// `caregiversNotFound` when present, since they're real structural keys —
// no separate mechanism is needed to "recognize" them.
export function summarizeResponse(
  endpoint: AxisCareEndpointName,
  statusCode: number,
  body: unknown
): AxisCareEndpointDiscovery {
  const discovery = emptyDiscovery(endpoint);
  discovery.attempted = true;
  discovery.success = true;
  discovery.statusCode = statusCode;

  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    discovery.topLevelKeys = Object.keys(obj);
    if (obj.results && typeof obj.results === "object" && !Array.isArray(obj.results)) {
      discovery.resultsKeys = Object.keys(obj.results as Record<string, unknown>);
    }
  }

  const resourceKey = RESOURCE_KEY_BY_ENDPOINT[endpoint];
  const collection = extractCollection(body, resourceKey);
  discovery.recordCount = collection ? collection.recordCount : null;
  discovery.collectionShape = collection ? collection.collectionShape : null;

  const sample =
    collection && collection.records.length > 0 ? collection.records[0] : body;
  discovery.sampleFieldNames = extractFieldPaths(sample);

  discovery.pagination = detectPagination(body);

  return discovery;
}

async function discoverEndpoint(
  endpoint: AxisCareEndpointName,
  fetcher: () => Promise<{ statusCode: number; body: unknown }>
): Promise<{ discovery: AxisCareEndpointDiscovery; fieldPaths: string[] }> {
  try {
    const { statusCode, body } = await fetcher();
    const discovery = summarizeResponse(endpoint, statusCode, body);
    return { discovery, fieldPaths: discovery.sampleFieldNames };
  } catch (err) {
    const discovery = emptyDiscovery(endpoint);
    discovery.attempted = true;
    if (err instanceof AxisCareError) {
      discovery.errorCategory = err.category;
      discovery.safeMessage = err.message;
      discovery.statusCode = err.statusCode;
    } else {
      discovery.errorCategory = "unknown";
      discovery.safeMessage = "AxisCare request failed for an unknown reason.";
    }
    return { discovery, fieldPaths: [] };
  }
}

// Orchestrates the full discovery pass in priority order: visits,
// schedules, clients, caregivers, applicants, organizations, adls,
// adlCategories, taggingCategories, expiringTokens. Stops trying nothing —
// every endpoint is attempted independently even if an earlier one fails,
// so one bad guess at an endpoint path doesn't hide the others.
export async function runAxisCareDiscovery(): Promise<AxisCareDiscoveryResult> {
  const configuration = getAxisCareConfigurationState();

  if (!configuration.configured) {
    const endpoints = (
      [
        "visits",
        "schedules",
        "clients",
        "caregivers",
        "applicants",
        "organizations",
        "adls",
        "adlCategories",
        "taggingCategories",
        "expiringTokens",
      ] as const
    ).map((endpoint) => {
      const discovery = emptyDiscovery(endpoint);
      discovery.errorCategory = "configuration";
      discovery.safeMessage = "AxisCare integration is not configured.";
      return discovery;
    });
    return { configuration, endpoints, cinchProvenanceFieldNames: [] };
  }

  const allFieldPaths: string[] = [];
  const endpoints: AxisCareEndpointDiscovery[] = [];

  const visits = await discoverEndpoint("visits", getTodaysVisits);
  endpoints.push(visits.discovery);
  allFieldPaths.push(...visits.fieldPaths);

  const schedules = await discoverEndpoint("schedules", getScheduleSample);
  endpoints.push(schedules.discovery);
  allFieldPaths.push(...schedules.fieldPaths);

  const clients = await discoverEndpoint("clients", getClientSample);
  endpoints.push(clients.discovery);
  allFieldPaths.push(...clients.fieldPaths);

  const caregivers = await discoverEndpoint("caregivers", getCaregiverSample);
  endpoints.push(caregivers.discovery);
  allFieldPaths.push(...caregivers.fieldPaths);

  const applicants = await discoverEndpoint("applicants", getApplicantSample);
  endpoints.push(applicants.discovery);
  allFieldPaths.push(...applicants.fieldPaths);

  const organizations = await discoverEndpoint(
    "organizations",
    getOrganizationSample
  );
  endpoints.push(organizations.discovery);
  allFieldPaths.push(...organizations.fieldPaths);

  const adls = await discoverEndpoint("adls", getAdlSample);
  endpoints.push(adls.discovery);
  allFieldPaths.push(...adls.fieldPaths);

  const adlCategories = await discoverEndpoint(
    "adlCategories",
    getAdlCategorySample
  );
  endpoints.push(adlCategories.discovery);
  allFieldPaths.push(...adlCategories.fieldPaths);

  const taggingCategories = await discoverEndpoint(
    "taggingCategories",
    getTaggingCategorySample
  );
  endpoints.push(taggingCategories.discovery);
  allFieldPaths.push(...taggingCategories.fieldPaths);

  const expiringTokens = await discoverEndpoint(
    "expiringTokens",
    getExpiringTokensSample
  );
  endpoints.push(expiringTokens.discovery);
  allFieldPaths.push(...expiringTokens.fieldPaths);

  return {
    configuration,
    endpoints,
    cinchProvenanceFieldNames: findCinchProvenanceFieldNames(allFieldPaths),
  };
}
