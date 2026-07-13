// Raw, minimally-typed AxisCare API response shapes.
//
// The envelope shapes below (results.<resource>, results.nextPage, errors,
// success) and the AxisCareRawVisit field paths come from the AxisCare
// OpenAPI specification supplied directly by Hud (available to him outside
// this filesystem context) — they are NOT guesses. Everything else (the
// exact schedule/client/caregiver field shapes beyond their envelope key)
// remains unconfirmed and loosely typed on purpose, with an index
// signature so discovery can safely inspect whatever fields actually come
// back. See docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md for which
// parts are spec-confirmed vs. still-to-verify against a live response.

// ─── Visit sub-objects (spec-confirmed field paths) ─────────────────────

export interface AxisCareVisitPersonRef {
  id?: string | number;
  firstName?: string;
  lastName?: string;
  externalId?: string | number;
  [key: string]: unknown;
}

export interface AxisCareClockEvent {
  time?: string | null;
  method?: string | null;
  [key: string]: unknown;
}

export interface AxisCareVisitService {
  id?: string | number;
  code?: string;
  description?: string;
  procedureCode?: string;
  [key: string]: unknown;
}

export interface AxisCareModificationReason {
  id?: string | number;
  name?: string;
  [key: string]: unknown;
}

// Field paths (id, client.*, caregiver.*, startDate/endDate,
// scheduledStartDate/scheduledEndDate, clockIn/clockOut, timezone,
// service.*, type, verified, removed, modificationReason.*) are
// spec-confirmed AND live-confirmed — the first real discovery run (HTTP
// 200, 11 records) observed these field names on real (unlogged, unread)
// visit records. Every field stays optional — presence in the type does
// not mean AxisCare guarantees it on every visit. Charge/billing fields
// are deliberately not modeled — not needed for schedule visibility, and
// modeling them would invite scope creep toward billing data this
// integration has no reason to touch.
export interface AxisCareRawVisit {
  id?: string | number;
  client?: AxisCareVisitPersonRef;
  caregiver?: AxisCareVisitPersonRef;
  startDate?: string;
  endDate?: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  clockIn?: AxisCareClockEvent;
  clockOut?: AxisCareClockEvent;
  timezone?: string;
  service?: AxisCareVisitService;
  type?: string;
  verified?: boolean;
  removed?: boolean;
  modificationReason?: AxisCareModificationReason;
  [key: string]: unknown;
}

// Live-confirmed (HTTP 200, 9 records) after the startDate/endDate
// correction. Note the schedule's own identifier field is `scheduleId`,
// not `id` like visits — schedules also carry `planId` (the recurring
// plan this schedule entry belongs to). Field paths (scheduleId, planId,
// type, day, client.*, caregiver, startTime, endTime, timezone,
// startDate, endDate, frequency, service.*) are live-confirmed.
export interface AxisCareRawSchedule {
  scheduleId?: string | number;
  planId?: string | number;
  type?: string;
  day?: string;
  client?: AxisCareVisitPersonRef;
  caregiver?: AxisCareVisitPersonRef;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  startDate?: string;
  endDate?: string;
  frequency?: string;
  service?: AxisCareVisitService;
  [key: string]: unknown;
}

// Live-confirmed (HTTP 200, one record): client responses expose
// extensive sensitive fields (addresses, DOB, email, phone, notes,
// medical fields, billing fields, per the live discovery run). This type
// deliberately does NOT enumerate those fields — see "Client Privacy
// Policy" in docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md. The
// production schedule path should not need full client objects at all;
// resident/client identity should come from Visit responses'
// client.id/firstName/lastName/externalId instead. This type stays a bare
// index signature so discovery can still report field *names* without
// this codebase ever encoding which sensitive fields exist.
export interface AxisCareRawClient {
  id?: string | number;
  [key: string]: unknown;
}

// Live-confirmed (HTTP 200): results.caregivers is an object keyed by
// caregiver ID, not a bare array — see AxisCareCaregiversResponse below
// and discovery.ts's normalizeCollection(). This type describes one
// caregiver record's shape (a value inside that keyed object), not the
// envelope itself.
export interface AxisCareRawCaregiver {
  id?: string | number;
  [key: string]: unknown;
}

// ─── Response envelopes ──────────────────────────────────────────────────
//
// AxisCare list responses nest the collection *inside* `results`, keyed by
// resource name — not a bare top-level array and not a generic
// `results: [...]`. Pagination is `results.nextPage`, not a top-level
// field. `errors` (and `success`, live-confirmed for caregivers) sit
// alongside `results` at the top level.
//
// The collection value itself (e.g. `results.visits`) is typed `unknown`
// rather than a bare array — live discovery confirmed AxisCare does not
// consistently use one shape. `results.caregivers` is live-confirmed to be
// an object keyed by caregiver ID, not an array. `results.schedules`'
// real shape is still unconfirmed (first live attempt 422'd before a
// shape could be observed). Runtime interpretation (array vs. single
// object vs. keyed-by-ID object) happens in discovery.ts's
// normalizeCollection() — see that file for why a type-level union isn't
// used here (the meaningful distinction is a runtime decision, not a
// compile-time one, since discovery must handle whatever shape actually
// comes back).

export interface AxisCareVisitsResponse {
  results?: {
    // Live-confirmed (HTTP 200, 11 records): an array of AxisCareRawVisit.
    visits?: unknown;
    nextPage?: string | number | null;
    [key: string]: unknown;
  };
  errors?: unknown[];
  success?: boolean;
  [key: string]: unknown;
}

// Live-confirmed (HTTP 200, 9 records, array shape) after the
// startDate/endDate correction.
export interface AxisCareSchedulesResponse {
  results?: {
    schedules?: unknown;
    nextPage?: string | number | null;
    [key: string]: unknown;
  };
  errors?: unknown[];
  success?: boolean;
  [key: string]: unknown;
}

export interface AxisCareClientsResponse {
  results?: {
    // Live-confirmed (HTTP 200, one record) — see AxisCareRawClient's
    // comment on why sensitive fields are not enumerated here.
    clients?: unknown;
    nextPage?: string | number | null;
    [key: string]: unknown;
  };
  errors?: unknown[];
  success?: boolean;
  [key: string]: unknown;
}

export interface AxisCareCaregiversResponse {
  results?: {
    // Live-confirmed: an object keyed by caregiver ID, not an array.
    caregivers?: unknown;
    // Live-confirmed field, shape not yet inspected in detail — treated
    // as opaque; discovery never reads its values, only notes presence
    // via resultsKeys.
    caregiversNotFound?: unknown;
    nextPage?: string | number | null;
    [key: string]: unknown;
  };
  errors?: unknown[];
  success?: boolean;
  [key: string]: unknown;
}
