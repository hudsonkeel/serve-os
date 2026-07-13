// Pure-function tests for the AxisCare read-only integration.
//
// This repository has no unit-test framework (no jest/vitest/mocha) and
// this spike deliberately does not add one — see
// docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md for the reasoning.
// Instead this file is a small, dependency-free assertion script using
// Node's built-in `node:assert/strict`, runnable the same way as the
// discovery script itself:
//
//   npm run test:axiscare
//
// All fixtures below are entirely fictional — no real AxisCare data, no
// real names, no real IDs. They exist only to exercise field-name
// extraction and redaction logic, plus the corrected request contract
// (base URL, headers, envelope shapes) from the supplied AxisCare OpenAPI
// specification.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  extractFieldPaths,
  findCinchProvenanceFieldNames,
  extractCollection,
  normalizeCollection,
  summarizeResponse,
} from "../discovery.ts";
import {
  AxisCareError,
  categorizeHttpStatus,
  safeErrorMessage,
} from "../errors.ts";
import { getAxisCareConfigurationState, isAxisCareScheduleEnabled } from "../config.ts";
import { axisCareGet } from "../client.ts";
import { getTodaysVisits } from "../visits.ts";
import { getScheduleSample } from "../schedules.ts";
import { getClientSample } from "../clients.ts";
import { getCaregiverSample } from "../caregivers.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

// ─── Field-name extraction (fictional, nested fixture) ─────────────────

test("extractFieldPaths returns key paths, never values", () => {
  const fictionalVisit = {
    id: "fict-001",
    startDate: "2026-01-01T09:00:00Z",
    client: { id: "fict-client-001", firstName: "Fictional", lastName: "Client" },
    caregiver: { id: "fict-caregiver-001", firstName: "Fictional", lastName: "Caregiver" },
  };

  const paths = extractFieldPaths(fictionalVisit);

  assert.ok(paths.includes("id"));
  assert.ok(paths.includes("startDate"));
  assert.ok(paths.includes("client"));
  assert.ok(paths.includes("client.id"));
  assert.ok(paths.includes("client.firstName"));
  assert.ok(paths.includes("caregiver.id"));

  // Must never leak values into the path list.
  const serialized = paths.join("|");
  assert.ok(!serialized.includes("fict-001"));
  assert.ok(!serialized.includes("fict-client-001"));
});

test("extractFieldPaths respects maxDepth and stops recursing", () => {
  const deeplyNested = { a: { b: { c: { d: "unreachable-value" } } } };
  const paths = extractFieldPaths(deeplyNested, "", 1);
  assert.ok(paths.includes("a"));
  assert.ok(paths.includes("a.b"));
  assert.ok(!paths.includes("a.b.c"));
});

test("extractFieldPaths inspects only the first array element's shape", () => {
  const many = [{ id: 1, secret: "should-not-appear-elsewhere" }, { id: 2 }];
  const paths = extractFieldPaths(many);
  assert.deepEqual(paths.sort(), ["id", "secret"]);
});

test("extractFieldPaths reaches spec-confirmed 2-level visit field paths", () => {
  const fictionalVisit = {
    clockIn: { time: "2026-01-01T09:00:00Z", method: "app" },
    service: { id: "fict-svc-1", code: "H0000", procedureCode: "T1019" },
    modificationReason: { id: "fict-reason-1", name: "Fictional Reason" },
  };
  const paths = extractFieldPaths(fictionalVisit);
  assert.ok(paths.includes("clockIn.time"));
  assert.ok(paths.includes("clockIn.method"));
  assert.ok(paths.includes("service.code"));
  assert.ok(paths.includes("service.procedureCode"));
  assert.ok(paths.includes("modificationReason.name"));
});

// ─── CINCH provenance field-name detection (names only) ────────────────

test("findCinchProvenanceFieldNames flags known keyword fields, including nested paths", () => {
  const paths = [
    "id",
    "startDate",
    "serviceType",
    "client.branch",
    "sourceSystem",
    "service.code",
    "unrelatedField",
  ];
  const found = findCinchProvenanceFieldNames(paths);
  assert.ok(found.includes("serviceType"));
  assert.ok(found.includes("client.branch"));
  assert.ok(found.includes("sourceSystem"));
  // Regression check: full-path normalization must catch a keyword split
  // across nesting (service.code -> "servicecode"), not just the last
  // path segment ("code" alone would never match "servicecode").
  assert.ok(found.includes("service.code"));
  assert.ok(!found.includes("id"));
  assert.ok(!found.includes("startDate"));
  assert.ok(!found.includes("unrelatedField"));
});

test("findCinchProvenanceFieldNames returns empty for a clean fixture", () => {
  const found = findCinchProvenanceFieldNames(["id", "startDate", "verified"]);
  assert.deepEqual(found, []);
});

// ─── Envelope / record-array extraction ─────────────────────────────────

test("extractCollection extracts the spec-confirmed results.<resource> shape", () => {
  assert.equal(
    extractCollection({ results: { visits: [1, 2] } }, "visits")?.recordCount,
    2
  );
  assert.equal(
    extractCollection({ results: { clients: [1] } }, "clients")?.recordCount,
    1
  );
  assert.equal(
    extractCollection({ results: { caregivers: [] } }, "caregivers")?.recordCount,
    0
  );
  // Wrong resourceKey for the shape present -> no silent cross-match.
  assert.equal(extractCollection({ results: { visits: [1] } }, "clients"), null);
});

test("extractCollection falls back to generic shapes for unexpected envelopes", () => {
  assert.equal(extractCollection([1, 2, 3])?.recordCount, 3);
  assert.equal(extractCollection({ data: [1, 2] })?.recordCount, 2);
  assert.equal(extractCollection({ results: [1] })?.recordCount, 1);
  assert.equal(extractCollection({ items: [] })?.recordCount, 0);
  assert.equal(extractCollection({ somethingElse: [1] }), null);
  assert.equal(extractCollection(null), null);
});

// ─── normalizeCollection: array / single object / keyed-by-ID object ────

test("normalizeCollection handles a plain array", () => {
  const result = normalizeCollection([{ id: "fict-1" }, { id: "fict-2" }]);
  assert.equal(result.collectionShape, "array");
  assert.equal(result.recordCount, 2);
  assert.equal(result.records.length, 2);
});

test("normalizeCollection handles an empty array and empty object as 'empty'", () => {
  assert.equal(normalizeCollection([]).collectionShape, "empty");
  assert.equal(normalizeCollection({}).collectionShape, "empty");
  assert.equal(normalizeCollection([]).recordCount, 0);
});

test("normalizeCollection treats a lone record object as 'single_object'", () => {
  // A "single schedule object" per the task's Part 2 — not a map of many.
  // Heuristic: values aren't themselves all record-shaped, so it's held to
  // be one record rather than several.
  const result = normalizeCollection({ id: "fict-1", startDate: "2026-01-01" });
  assert.equal(result.collectionShape, "single_object");
  assert.equal(result.recordCount, 1);
  assert.deepEqual(result.records, [{ id: "fict-1", startDate: "2026-01-01" }]);
});

test("normalizeCollection treats an object keyed by ID as 'keyed_object' and does not use the map keys as data", () => {
  // Mirrors the live-observed results.caregivers shape (object keyed by
  // caregiver ID). The outer map keys are deliberately DIFFERENT strings
  // from anything inside the values (unlike real AxisCare data, where a
  // record's own id field would plausibly match its map key) — this
  // isolates what this test actually checks: that normalizeCollection
  // derives records from Object.values(), never Object.keys(). (Whether a
  // record's *own* id value should ever be surfaced is a separate
  // question, covered by the sanitized summarizeResponse-level test
  // below, since normalizeCollection itself does no sanitization — it
  // only reshapes array/object/keyed-object input into a flat array.)
  const keyedFixture = {
    "outer-map-key-1": { recordId: "inner-value-1", firstName: "Fictional" },
    "outer-map-key-2": { recordId: "inner-value-2", firstName: "Fictional" },
  };
  const result = normalizeCollection(keyedFixture);
  assert.equal(result.collectionShape, "keyed_object");
  // recordCount = Object.keys(...).length, per the task's instruction —
  // computed here via Object.values().length, numerically identical.
  assert.equal(result.recordCount, 2);
  assert.equal(result.records.length, 2);

  // The outer map's keys must not appear anywhere in the returned
  // records — only each record's own (distinct) field values do.
  const serialized = JSON.stringify(result.records);
  assert.ok(!serialized.includes("outer-map-key-1"));
  assert.ok(!serialized.includes("outer-map-key-2"));
  assert.ok(serialized.includes("inner-value-1"));
  assert.ok(serialized.includes("inner-value-2"));
});

// ─── Sanitized discovery summary (fictional fixture, real envelope shape) ─

test("summarizeResponse recognizes results.visits, results.nextPage, and errors", () => {
  const fictionalResponse = {
    results: {
      visits: [
        {
          id: "fict-visit-1",
          startDate: "2026-01-01",
          client: { firstName: "Fictional", lastName: "Client" },
          service: { code: "H0000" },
        },
      ],
      nextPage: "https://16282.axiscare.com/api/visits?page=2",
    },
    errors: [],
  };

  const discovery = summarizeResponse("visits", 200, fictionalResponse);

  assert.equal(discovery.attempted, true);
  assert.equal(discovery.success, true);
  assert.equal(discovery.statusCode, 200);
  assert.equal(discovery.recordCount, 1);
  assert.equal(discovery.collectionShape, "array");
  assert.ok(discovery.topLevelKeys.includes("results"));
  assert.ok(discovery.topLevelKeys.includes("errors"));
  assert.ok(discovery.resultsKeys.includes("visits"));
  assert.ok(discovery.resultsKeys.includes("nextPage"));
  assert.ok(discovery.sampleFieldNames.includes("client.firstName"));
  assert.ok(discovery.sampleFieldNames.includes("service.code"));
  assert.equal(discovery.pagination.detected, true);
  assert.ok(discovery.pagination.fields.includes("results.nextPage"));

  const serialized = JSON.stringify(discovery);
  assert.ok(!serialized.includes("Fictional"));
  assert.ok(!serialized.includes("fict-visit-1"));
});

test("summarizeResponse reports no pagination when results.nextPage is absent", () => {
  const fictionalResponse = {
    results: { clients: [{ id: "fict-client-1" }] },
  };
  const discovery = summarizeResponse("clients", 200, fictionalResponse);
  assert.equal(discovery.pagination.detected, false);
  assert.deepEqual(discovery.pagination.fields, []);
});

test("summarizeResponse handles a keyed-by-ID caregivers object without leaking the keys", () => {
  // Mirrors the live-observed shape: results.caregivers is an object keyed
  // by caregiver ID, not an array. Fictional IDs and names only.
  const fictionalResponse = {
    results: {
      caregivers: {
        "fict-caregiver-aaa": {
          id: "fict-caregiver-aaa",
          firstName: "Fictional",
          lastName: "Caregiver",
        },
        "fict-caregiver-bbb": {
          id: "fict-caregiver-bbb",
          firstName: "Also-Fictional",
          lastName: "Caregiver",
        },
      },
      caregiversNotFound: [],
      nextPage: null,
    },
    success: true,
  };

  const discovery = summarizeResponse("caregivers", 200, fictionalResponse);

  assert.equal(discovery.collectionShape, "keyed_object");
  // recordCount must reflect the number of caregivers in the map.
  assert.equal(discovery.recordCount, 2);
  assert.ok(discovery.resultsKeys.includes("caregivers"));
  assert.ok(discovery.resultsKeys.includes("caregiversNotFound"));
  assert.ok(discovery.topLevelKeys.includes("success"));
  // Sample field names must come from a caregiver's own fields...
  assert.ok(discovery.sampleFieldNames.includes("firstName"));
  assert.ok(discovery.sampleFieldNames.includes("lastName"));

  // ...and must never include the outer map's ID keys anywhere in the
  // discovery output, whether as a field name or serialized elsewhere.
  const serialized = JSON.stringify(discovery);
  assert.ok(!serialized.includes("fict-caregiver-aaa"));
  assert.ok(!serialized.includes("fict-caregiver-bbb"));
  assert.ok(!discovery.sampleFieldNames.includes("fict-caregiver-aaa"));
  assert.ok(!discovery.topLevelKeys.includes("fict-caregiver-aaa"));
  assert.ok(!discovery.resultsKeys.includes("fict-caregiver-aaa"));
});

test("summarizeResponse handles results.schedules as an array, a single object, or a keyed object", () => {
  const asArray = summarizeResponse("schedules", 200, {
    results: { schedules: [{ id: "fict-sched-1" }], nextPage: null },
  });
  assert.equal(asArray.collectionShape, "array");
  assert.equal(asArray.recordCount, 1);

  const asSingleObject = summarizeResponse("schedules", 200, {
    results: { schedules: { id: "fict-sched-1", startDate: "2026-01-01" }, nextPage: null },
  });
  assert.equal(asSingleObject.collectionShape, "single_object");
  assert.equal(asSingleObject.recordCount, 1);

  const asKeyedObject = summarizeResponse("schedules", 200, {
    results: {
      schedules: { "fict-sched-1": { id: "fict-sched-1" }, "fict-sched-2": { id: "fict-sched-2" } },
      nextPage: null,
    },
  });
  assert.equal(asKeyedObject.collectionShape, "keyed_object");
  assert.equal(asKeyedObject.recordCount, 2);
  assert.ok(!JSON.stringify(asKeyedObject).includes("fict-sched-1"));
});

test("summarizeResponse never leaks a fictional sensitive client field value", () => {
  // Stands in for the live finding that client records expose extensive
  // sensitive fields (addresses, DOB, email, phone, notes, medical,
  // billing). This asserts the general guarantee — field names may
  // appear, values never do — using fictional data.
  const fictionalResponse = {
    results: {
      clients: [
        {
          id: "fict-client-1",
          firstName: "Fictional",
          ssn: "000-00-0000",
          dateOfBirth: "1900-01-01",
          address: "123 Fictional St",
        },
      ],
      nextPage: null,
    },
  };
  const discovery = summarizeResponse("clients", 200, fictionalResponse);
  assert.ok(discovery.sampleFieldNames.includes("ssn"));
  assert.ok(discovery.sampleFieldNames.includes("dateOfBirth"));
  assert.ok(discovery.sampleFieldNames.includes("address"));

  const serialized = JSON.stringify(discovery);
  assert.ok(!serialized.includes("000-00-0000"));
  assert.ok(!serialized.includes("1900-01-01"));
  assert.ok(!serialized.includes("123 Fictional St"));
  assert.ok(!serialized.includes("fict-client-1"));
});

// ─── Error redaction ──────────────────────────────────────────────────

test("categorizeHttpStatus maps known status codes correctly", () => {
  assert.equal(categorizeHttpStatus(401), "authentication");
  assert.equal(categorizeHttpStatus(403), "authorization");
  assert.equal(categorizeHttpStatus(429), "rate_limit");
  assert.equal(categorizeHttpStatus(500), "upstream_unavailable");
  assert.equal(categorizeHttpStatus(503), "upstream_unavailable");
  assert.equal(categorizeHttpStatus(404), "invalid_response");
  assert.equal(categorizeHttpStatus(200), "unknown");
});

test("safeErrorMessage never includes a token or raw vendor text", () => {
  const fakeToken = "axc_should_never_appear_in_any_message";
  for (const category of [
    "configuration",
    "authentication",
    "authorization",
    "rate_limit",
    "timeout",
    "upstream_unavailable",
    "invalid_response",
    "unknown",
  ] as const) {
    const message = safeErrorMessage(category, 500);
    assert.ok(!message.includes(fakeToken));
    assert.ok(message.length > 0);
  }
});

test("AxisCareError never exposes a token via its message or properties", () => {
  const err = new AxisCareError("authentication", safeErrorMessage("authentication", 401), 401);
  assert.equal(err.category, "authentication");
  assert.equal(err.statusCode, 401);
  assert.ok(!err.message.toLowerCase().includes("bearer"));
  assert.ok(!("token" in err));
});

// ─── Configuration state never exposes the token ─────────────────────

test("getAxisCareConfigurationState never returns the token itself", () => {
  const original = process.env.AXISCARE_API_TOKEN;
  process.env.AXISCARE_API_TOKEN = "axc_fictional_test_token_value";
  try {
    const state = getAxisCareConfigurationState();
    const serialized = JSON.stringify(state);
    assert.ok(!serialized.includes("axc_fictional_test_token_value"));
    assert.equal(typeof state.tokenPresent, "boolean");
    assert.equal(state.tokenPresent, true);
  } finally {
    if (original === undefined) delete process.env.AXISCARE_API_TOKEN;
    else process.env.AXISCARE_API_TOKEN = original;
  }
});

test("getAxisCareConfigurationState reports missing vars by name only", () => {
  const keys = [
    "AXISCARE_API_TOKEN",
    "AXISCARE_SITE_NUMBER",
    "AXISCARE_API_VERSION",
    "AXISCARE_API_BASE_URL",
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    const state = getAxisCareConfigurationState();
    assert.equal(state.configured, false);
    assert.deepEqual([...state.missing].sort(), [...keys].sort());
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test("getAxisCareConfigurationState rejects a non-HTTPS base URL", () => {
  const saved = process.env.AXISCARE_API_BASE_URL;
  process.env.AXISCARE_API_BASE_URL = "http://insecure.example.com";
  try {
    const state = getAxisCareConfigurationState();
    assert.equal(state.baseUrlIsHttps, false);
    assert.equal(state.configured, false);
  } finally {
    if (saved === undefined) delete process.env.AXISCARE_API_BASE_URL;
    else process.env.AXISCARE_API_BASE_URL = saved;
  }
});

test("getAxisCareConfigurationState rejects a base URL that already ends in /api", () => {
  const saved = process.env.AXISCARE_API_BASE_URL;
  process.env.AXISCARE_API_BASE_URL = "https://16282.axiscare.com/api";
  try {
    const state = getAxisCareConfigurationState();
    assert.equal(state.baseUrlEndsWithApiSegment, true);
    assert.equal(state.configured, false);
  } finally {
    if (saved === undefined) delete process.env.AXISCARE_API_BASE_URL;
    else process.env.AXISCARE_API_BASE_URL = saved;
  }
});

test("getAxisCareConfigurationState accepts a bare server-origin base URL", () => {
  const saved = process.env.AXISCARE_API_BASE_URL;
  process.env.AXISCARE_API_BASE_URL = "https://16282.axiscare.com";
  try {
    const state = getAxisCareConfigurationState();
    assert.equal(state.baseUrlEndsWithApiSegment, false);
    assert.equal(state.baseUrlIsHttps, true);
  } finally {
    if (saved === undefined) delete process.env.AXISCARE_API_BASE_URL;
    else process.env.AXISCARE_API_BASE_URL = saved;
  }
});

// ─── HTTP client: request contract (fetch monkey-patched, request captured) ─
// NOTE: this does not exercise real AbortController/timeout behavior —
// that path is only exercised by a real run against a live (or hanging)
// endpoint, which this pure-function test suite deliberately does not
// attempt. Documented as a known limitation.

interface CapturedRequest {
  url: URL;
  headers: Record<string, string>;
}

async function withFakeFetch<T>(
  fakeResponse: Partial<Response> & { ok: boolean; status: number },
  fn: (captured: CapturedRequest[]) => Promise<T>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    AXISCARE_API_TOKEN: process.env.AXISCARE_API_TOKEN,
    AXISCARE_SITE_NUMBER: process.env.AXISCARE_SITE_NUMBER,
    AXISCARE_API_VERSION: process.env.AXISCARE_API_VERSION,
    AXISCARE_API_BASE_URL: process.env.AXISCARE_API_BASE_URL,
  };
  process.env.AXISCARE_API_TOKEN = "axc_fictional_test_token";
  process.env.AXISCARE_SITE_NUMBER = "00000";
  process.env.AXISCARE_API_VERSION = "2023-10-01";
  process.env.AXISCARE_API_BASE_URL = "https://00000.axiscare.com";

  const captured: CapturedRequest[] = [];

  // @ts-expect-error — intentionally minimal fetch stub for this test only
  globalThis.fetch = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k] = v;
      }
    }
    captured.push({ url, headers });
    return fakeResponse as Response;
  };

  try {
    return await fn(captured);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("axisCareGet never sends X-AxisCare-Site-Number and builds exactly one /api segment", async () => {
  await withFakeFetch(
    { ok: true, status: 200, json: async () => ({}) },
    async (captured) => {
      await axisCareGet("/api/visits");
      assert.equal(captured.length, 1);
      const headerKeys = Object.keys(captured[0].headers).map((k) => k.toLowerCase());
      assert.ok(!headerKeys.includes("x-axiscare-site-number"));
      assert.ok(headerKeys.includes("authorization"));
      assert.ok(headerKeys.includes("x-axiscare-api-version"));
      assert.equal(captured[0].url.pathname, "/api/visits");
      assert.equal((captured[0].url.pathname.match(/\/api\//g) ?? []).length, 1);
    }
  );
});

test("getTodaysVisits sends identical same-day startDate and endDate (Central Time)", async () => {
  await withFakeFetch(
    { ok: true, status: 200, json: async () => ({ results: { visits: [], nextPage: null } }) },
    async (captured) => {
      await getTodaysVisits();
      assert.equal(captured.length, 1);
      const { url } = captured[0];
      assert.equal(url.pathname, "/api/visits");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      assert.ok(startDate);
      assert.match(startDate!, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(startDate, endDate);
      assert.equal(url.searchParams.has("updatedSinceDate"), false);
    }
  );
});

test("getScheduleSample sends identical same-day startDate and endDate (corrected from the HTTP 422)", async () => {
  await withFakeFetch(
    { ok: true, status: 200, json: async () => ({ results: { schedules: [], nextPage: null } }) },
    async (captured) => {
      await getScheduleSample();
      assert.equal(captured.length, 1);
      const { url } = captured[0];
      assert.equal(url.pathname, "/api/schedules");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      assert.ok(startDate);
      assert.match(startDate!, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(startDate, endDate);
      // Discovery deliberately does not use scheduleIds.
      assert.equal(url.searchParams.has("scheduleIds"), false);
    }
  );
});

test("getClientSample and getCaregiverSample never send requestedSensitiveFields", async () => {
  await withFakeFetch(
    { ok: true, status: 200, json: async () => ({ results: { clients: [], nextPage: null } }) },
    async (captured) => {
      await getClientSample();
      assert.equal(captured[0].url.pathname, "/api/clients");
      assert.equal(captured[0].url.searchParams.get("limit"), "1");
      assert.equal(captured[0].url.searchParams.has("requestedSensitiveFields"), false);
    }
  );
  await withFakeFetch(
    { ok: true, status: 200, json: async () => ({ results: { caregivers: [], nextPage: null } }) },
    async (captured) => {
      await getCaregiverSample();
      assert.equal(captured[0].url.pathname, "/api/caregivers");
      assert.equal(captured[0].url.searchParams.get("limit"), "1");
      assert.equal(captured[0].url.searchParams.has("requestedSensitiveFields"), false);
    }
  );
});

test("axisCareGet throws invalid_response on non-JSON body", async () => {
  await withFakeFetch(
    {
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    },
    async () => {
      await assert.rejects(
        () => axisCareGet("/api/visits"),
        (err: unknown) => {
          assert.ok(err instanceof AxisCareError);
          assert.equal(err.category, "invalid_response");
          return true;
        }
      );
    }
  );
});

test("axisCareGet categorizes a 401 as authentication without leaking body", async () => {
  await withFakeFetch(
    {
      ok: false,
      status: 401,
      text: async () => "raw vendor body with sensitive detail",
    },
    async () => {
      await assert.rejects(
        () => axisCareGet("/api/visits"),
        (err: unknown) => {
          assert.ok(err instanceof AxisCareError);
          assert.equal(err.category, "authentication");
          assert.ok(!err.message.includes("raw vendor body"));
          return true;
        }
      );
    }
  );
});

// ─── Release-control flag: isAxisCareScheduleEnabled() ──────────────────

function withScheduleFlag<T>(value: string | undefined, fn: () => T): T {
  const saved = process.env.AXISCARE_SCHEDULE_ENABLED;
  if (value === undefined) delete process.env.AXISCARE_SCHEDULE_ENABLED;
  else process.env.AXISCARE_SCHEDULE_ENABLED = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.AXISCARE_SCHEDULE_ENABLED;
    else process.env.AXISCARE_SCHEDULE_ENABLED = saved;
  }
}

test("isAxisCareScheduleEnabled: missing env var is disabled", () => {
  withScheduleFlag(undefined, () => {
    assert.equal(isAxisCareScheduleEnabled(), false);
  });
});

test("isAxisCareScheduleEnabled: empty string is disabled", () => {
  withScheduleFlag("", () => {
    assert.equal(isAxisCareScheduleEnabled(), false);
  });
});

test("isAxisCareScheduleEnabled: 'false' is disabled", () => {
  withScheduleFlag("false", () => {
    assert.equal(isAxisCareScheduleEnabled(), false);
  });
});

test("isAxisCareScheduleEnabled: 'TRUE'/'True' are disabled — exact case-sensitive match only, no normalization", () => {
  withScheduleFlag("TRUE", () => {
    assert.equal(isAxisCareScheduleEnabled(), false);
  });
  withScheduleFlag("True", () => {
    assert.equal(isAxisCareScheduleEnabled(), false);
  });
});

test("isAxisCareScheduleEnabled: any other value (e.g. '1', 'yes') is disabled", () => {
  withScheduleFlag("1", () => {
    assert.equal(isAxisCareScheduleEnabled(), false);
  });
  withScheduleFlag("yes", () => {
    assert.equal(isAxisCareScheduleEnabled(), false);
  });
});

test("isAxisCareScheduleEnabled: exactly 'true' is enabled", () => {
  withScheduleFlag("true", () => {
    assert.equal(isAxisCareScheduleEnabled(), true);
  });
});

// ─── Release-control flag: no client-side reader exists ─────────────────

function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath);
    if (/\.(ts|tsx)$/.test(entry.name)) return [fullPath];
    return [];
  });
}

test("AXISCARE_SCHEDULE_ENABLED is never referenced under app/ or components/ (server-only flag, no client reader)", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../../..");
  const candidateFiles = [
    ...listFilesRecursive(path.join(repoRoot, "app")),
    ...listFilesRecursive(path.join(repoRoot, "components")),
  ];
  const offenders = candidateFiles.filter((file) =>
    fs.readFileSync(file, "utf8").includes("AXISCARE_SCHEDULE_ENABLED")
  );
  assert.deepEqual(
    offenders,
    [],
    `AXISCARE_SCHEDULE_ENABLED must only be read from lib/integrations/axiscare/config.ts, not: ${offenders.join(", ")}`
  );
});

// ─── Runner ──────────────────────────────────────────────────────────

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();
