# AxisCare Read-Only Integration

## Purpose

Phase 1 of the Serve OS Scheduling Intelligence Architecture: understand
AxisCare's actual API behavior and response structure, safely, before any
production UI or data model is built on top of it.

## Current Phase

**Discovery only — first live run complete.** This integration:

- authenticates to AxisCare and performs a small number of read-only `GET`
  requests
- returns sanitized metadata about the response shape (status codes, key
  names, record counts, pagination fields) — never raw payloads
- does **not** power any production UI yet
- does **not** persist anything to Supabase
- does **not** write to AxisCare in any way

No AxisCare OpenAPI specification file exists in this repository. The
initial version of this integration was built without one and flagged
every path/header/envelope choice as an unverified guess. Hud then
supplied the authoritative contract from AxisCare's OpenAPI specification
(available to him outside this filesystem context), and subsequently ran
`npm run axiscare:discover` against the live API. Status as of this
reconciliation pass:

| Endpoint | Live status | Result |
|---|---|---|
| Visits | HTTP 200 | 11 records, envelope `results.visits`, array shape |
| Schedules | HTTP 200 (after correction) | 9 records, envelope `results.schedules`, array shape |
| Clients | HTTP 200 | 1 record, envelope `results.clients`; exposes extensive sensitive fields — see "Client Privacy Policy" |
| Caregivers | HTTP 200 | Envelope `results.caregivers` is an **object keyed by caregiver ID**, not an array |

Nothing about either run was logged or printed beyond sanitized metadata
(status codes, envelope key names, record counts) — no client/caregiver
name, ID, or field value was read into this document or anywhere in the
codebase.

**Second live run (this pass):** after correcting `/api/schedules` to send
`startDate`/`endDate` (see "Endpoints Attempted"), it returned **HTTP 200,
9 records, envelope `results.schedules`, array shape** — matching visits'
and clients' shape, not caregivers' keyed-object shape. Live-observed
schedule field names: `scheduleId`, `planId`, `type`, `day`, `client`,
`client.id`, `client.firstName`, `client.lastName`, `client.externalId`,
`caregiver`, `startTime`, `endTime`, `timezone`, `startDate`, `endDate`,
`frequency`, `service`, `service.id`, `service.code`,
`service.description`, `service.procedureCode`. Note the schedule's own
identifier field is `scheduleId`, not `id` like visits, and schedules
additionally carry `planId` (the recurring plan a schedule entry belongs
to) — `lib/integrations/axiscare/types.ts`'s `AxisCareRawSchedule` has
been updated to reflect this exactly.

## Vendor-Neutral Mapping Boundary

This task also introduced `lib/scheduling/` — a vendor-neutral Serve OS
scheduling domain that consumes this integration's outputs
(`getTodaysVisitsBounded()` from `visits.ts`) and normalizes them into
`ServeScheduleVisit`/`ServeRecurringSchedule`. The boundary is strict:

- **AxisCare-specific field shapes stay inside `lib/integrations/axiscare/`.**
  `AxisCareRawVisit`, `AxisCareRawSchedule`, and the response envelope
  types never leave this folder except as inputs consumed by
  `lib/scheduling/normalize.ts`.
- **The rest of Serve OS (future Workspace UI, Community Intelligence,
  etc.) should only ever import from `lib/scheduling/`**, never reach into
  `lib/integrations/axiscare/` directly.
- Full detail on the domain model, status rules, date/time handling, and
  privacy boundary lives in
  [`docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`](../architecture/SERVE_SCHEDULING_INTELLIGENCE.md).

### Removed-Visit Counting (corrected 2026-07-12)

Live discovery surfaced a real bug: of 11 visit records, 7 were `removed`,
and the original summary logic folded every record's caregiver presence
into one broad assigned/unassigned split — a removed visit with no
caregiver inflated "unassigned" as if it were actionable coverage (8 of
11, when only 1 of the 4 *active* visits actually needed a caregiver).
`ServeScheduleSummary` and `getAxisCareTodaysSchedule()`'s `activeVisits`
field now make source-vs-active-vs-removed counting unambiguous — full
policy in
[`docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`](../architecture/SERVE_SCHEDULING_INTELLIGENCE.md)'s
"Source Records vs. Active Visits" section.

### Visits-Primary Policy

`lib/scheduling/todaysSchedule.ts`'s `getAxisCareTodaysSchedule()` uses
**Visits as the sole source** for today's operational schedule — it never
calls `/api/schedules`, `/api/clients`, or `/api/caregivers`. Schedules
(`lib/scheduling/normalize.ts`'s `normalizeAxisCareSchedule()`) exist only
as optional recurring-plan context for a later task, not wired into
today's schedule. Resident and caregiver display identity comes entirely
from the `client.*`/`caregiver.*` fields already present on each Visit
record — see "Client Privacy Policy" below for why this also serves a
least-privilege purpose, not just simplicity.

## Read-Only Architectural Policy

AxisCare remains the authoritative scheduling and visit-execution system.
Serve OS initially consumes only the minimum necessary read-only data to
provide:

- schedule visibility
- operational exception detection
- future Scheduling Intelligence
- direct resolution links back into AxisCare

**Write-back is not planned** unless later operational evidence proves
that read-plus-deep-link resolution is insufficient. Nothing in this
codebase issues a `POST`, `PUT`, `PATCH`, or `DELETE` request to AxisCare —
`lib/integrations/axiscare/client.ts` exposes exactly one function,
`axisCareGet`, with no `method` parameter, so a write request is not
reachable through this integration at all without a deliberate code change.

## Credentials

| Field | Value |
|---|---|
| Site number | 16282 |
| Token name | Serve OS — Read-Only Scheduling |
| Token expiration | Not provided in project context — confirm in the AxisCare admin console before relying on a specific expiration date |
| Granted scopes | Caregivers Read, Caregivers Read Sensitive, Clients Read, Clients Read Sensitive, Schedules Read, Visits Read |

The token itself is never included in this document, in code, in logs, or
in any committed fixture.

## Environment Variables

Server-only, read via `process.env` in exactly one module
(`lib/integrations/axiscare/config.ts`):

- `AXISCARE_API_TOKEN`
- `AXISCARE_SITE_NUMBER`
- `AXISCARE_API_VERSION`
- `AXISCARE_API_BASE_URL`

None are prefixed `NEXT_PUBLIC_` — none are reachable from the browser.
`.env.example` documents these as empty placeholders (no real values); the
real values live only in the gitignored `.env.local`.

## Base URL Contract

**Spec-confirmed.** `AXISCARE_API_BASE_URL` must be the bare server
origin, with the site number in the hostname and **no `/api` suffix**:

```
AXISCARE_API_BASE_URL=https://16282.axiscare.com
```

Every endpoint path already includes `/api` (`/api/visits`,
`/api/schedules`, `/api/clients`, `/api/caregivers`), so a base URL ending
in `/api` would double it to `/api/api/visits`. `config.ts` actively
rejects this: `getAxisCareConfigurationState().baseUrlEndsWithApiSegment`
reports it, and `getAxisCareConfig()` throws a
`configuration`-category error rather than silently building a broken URL.

## Authentication Headers

Every request sent by `axisCareGet()`:

```
Authorization: Bearer <AXISCARE_API_TOKEN>
X-AxisCare-Api-Version: 2023-10-01
Accept: application/json
```

**`X-AxisCare-Site-Number` is deliberately not sent.** The supplied spec
confirmed the site number is represented in the hostname
(`https://{siteNumber}.axiscare.com`), not a separate header — sending an
undocumented header would have been a guess. `AXISCARE_SITE_NUMBER`
remains a required environment variable and is still validated as
configuration metadata (`config.ts`), it's just not attached to requests.

## API Version Handling

`AXISCARE_API_VERSION` is read from configuration and sent verbatim as
`X-AxisCare-Api-Version` on every request. There is no client-side
validation of which versions are valid — that determination belongs to
AxisCare's API.

## Endpoints Attempted

In priority order, each a thin read-only wrapper over `axisCareGet()`:

| Order | Endpoint | Path | Module | Request scope | Live result |
|---|---|---|---|---|---|
| 1 | Visits | `/api/visits` | `lib/integrations/axiscare/visits.ts` | `startDate`/`endDate` both set to today, Central Time; required unless `updatedSinceDate` is used, which this phase deliberately does not use | HTTP 200, 11 records |
| 2 | Schedules | `/api/schedules` | `lib/integrations/axiscare/schedules.ts` | Sends `startDate`/`endDate` both set to today, Central Time, same as Visits — corrected from a prior bare request that returned HTTP 422 | HTTP 200, 9 records (verified live this pass) |
| 3 | Clients | `/api/clients` | `lib/integrations/axiscare/clients.ts` | `limit=1`; no `requestedSensitiveFields` sent | HTTP 200, 1 record |
| 4 | Caregivers | `/api/caregivers` | `lib/integrations/axiscare/caregivers.ts` | `limit=1`; no `requestedSensitiveFields` sent | HTTP 200, keyed-object envelope |

None of these depend on already knowing a real client/caregiver/schedule
ID, and none retrieve unlimited history. `schedules.ts` deliberately does
not use `scheduleIds` (AxisCare's alternative to `startDate`/`endDate`) —
using it would require already knowing a schedule ID, defeating the
purpose of discovery.

**Visit date parameters — a corrected bug:** the first version of this
integration computed `endDate` from an *exclusive* day-boundary helper
(`getCentralDayBoundaryUtc(0)`, designed for range comparisons like "due
before end of today") and naively sliced its ISO string, which actually
produced **tomorrow's** date, not today's. `visits.ts` now derives the
Central-time calendar date directly via
`Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" })`, and uses
the **same** date string for both `startDate` and `endDate`, matching the
task's requirement of a same-day request in Central Time (not UTC).

## Known Response Envelope Structure (live-verified where noted)

AxisCare list responses nest the collection *inside* `results`, keyed by
resource name — not a bare top-level array:

| Endpoint | Collection | Shape (live-observed) | Pagination | Notes |
|---|---|---|---|---|
| Visits | `results.visits` | **Array** | `results.nextPage` | Live-verified: HTTP 200, 11 records |
| Schedules | `results.schedules` | **Array** | `results.nextPage` | Live-verified: HTTP 200, 9 records (this pass) |
| Clients | `results.clients` | **Array** | `results.nextPage` | Live-verified: HTTP 200, 1 record |
| Caregivers | `results.caregivers` | **Object keyed by caregiver ID** | `results.nextPage` | Live-verified — see "Caregiver Keyed-Object Behavior" below |

`errors` (an array) sits alongside `results` at the top level on every
endpoint; `success` may also appear (live-observed on caregivers, along
with `results.caregiversNotFound`). `discovery.ts`'s `topLevelKeys` (top
level) and new `resultsKeys` (one level inside `results`) output naturally
surface all of these when present — no separate mechanism was needed.

### Caregiver Keyed-Object Behavior (live finding, corrected)

The live caregivers response does **not** use an array — `results.caregivers`
is an object whose keys are caregiver IDs and whose values are caregiver
records. `discovery.ts` now handles this via `normalizeCollection()`,
which classifies any found collection as one of:

- `array` — used as-is
- `keyed_object` — an object where every value looks like a record;
  `Object.values()` becomes the record list, `recordCount` is that list's
  length. **The map's own keys (the caregiver IDs) are never read into any
  record, never logged, and never appear anywhere in discovery output** —
  covered by a dedicated test using deliberately non-overlapping key/value
  strings so the assertion can't pass by accident.
- `single_object` — a lone record, not a map of many (e.g. a possible
  schedule shape per the task's Part 2)
- `empty` — no records

`extractCollection(body, resourceKey)` (renamed from `extractRecordsArray`
now that it returns shape metadata, not just an array) checks the known
`results.<resourceKey>` shape first and runs it through
`normalizeCollection()`, falling back to generic candidates (bare array,
`data`, `results`, `items`) only if that specific shape isn't present — so
an unexpected real response is still visible rather than silently
mishandled. `results.caregiversNotFound` is recognized structurally via
`resultsKeys` (its presence is reported; its contents are never read).

### Verification Method

The corrected extraction logic (array / keyed-object / single-object) was
verified against fictional, hand-authored fixtures using the real
`results.<resource>` shape, exercised through the pure-function test suite
(`lib/integrations/axiscare/__tests__/sanitization.test.ts`) — including a
fixture that deliberately uses non-overlapping outer-key vs. inner-value
strings specifically to prove the map's keys are never leaked, not merely
assumed safe. The live visits/clients/caregivers envelope shapes above
come directly from Hud's reported live discovery run; this codebase itself
made no live API call in this task.

`results.schedules` is now live-confirmed (array, 9 records) — no
remaining assumption on the schedules collection key.

## Pagination Behavior

### Discovery pagination detection

**Primary indicator: `results.nextPage`** — live-confirmed present on
visits, schedules, clients, and caregivers responses. `discovery.ts`
checks for it explicitly first, then falls back to a generic top-level
candidate list (`pagination`, `meta`, `page`, `pageSize`, `totalCount`,
`totalPages`, `nextPage`, `hasMore`, `next`, `cursor`, `links`) so an
unexpected shape is still visible rather than reported as "no pagination."
The discovery script does not auto-crawl pages — `results.nextPage` is
detected and reported, never followed.

### Today's Schedule bounded page-following (new this pass)

Unlike discovery, `lib/scheduling/todaysSchedule.ts`'s
`getAxisCareTodaysSchedule()` needs a *complete* daily schedule, so
`lib/integrations/axiscare/visits.ts`'s `getTodaysVisitsBounded()` will
follow `results.nextPage` — but only within a conservative bound, and only
when the value passes strict validation:

- **Bounds:** maximum 3 pages, maximum 500 total visits. Both are
  hardcoded constants in `visits.ts` (`MAX_PAGES`, `MAX_TOTAL_VISITS`),
  not configurable at runtime.
- **Natural stop:** as soon as `results.nextPage` is absent or `null`.
- **Validation before following (`validateNextPageUrl()`):** the
  candidate value must be a string that parses as a URL, use `https:`,
  match the *same hostname* as the configured `AXISCARE_API_BASE_URL`, and
  have a path starting with `/api/`. A bare page number, an opaque cursor
  token, a mismatched hostname, non-HTTPS, or a non-`/api` path all stop
  pagination immediately rather than guess how to construct the next
  request.
- **Reporting, not guessing, when bounded:** if the bound is hit while
  AxisCare's own `nextPage` still indicates more data, the result's
  `pagination.hasNextPage` is `true` — the caller (a future Workspace UI)
  can honestly say "more may exist" rather than silently truncating.
- Live discovery observed 11 visits and 9 schedules on a single page each
  — this bounded crawler is a safety net for a busier day, not something
  multi-page behavior has actually been confirmed to trigger yet.

## Safe Logging Policy

- The discovery script and test suite print only: endpoint name, attempted/
  success booleans, HTTP status code, record count, top-level key names,
  sample field *names* (never values), pagination field names, and a safe
  error category/message.
- `client.ts` never logs a response body, on success or failure. On a
  non-2xx response, the body is read (`response.text()`) only so the
  connection closes cleanly, then discarded — never logged, never included
  in the thrown error.
- No `console.log`/`console.error` call anywhere in this integration
  includes the token, a header value, or a field value.

## PHI-Handling Rules

- Discovery output never includes resident/client names, caregiver names,
  phone numbers, addresses, email addresses, notes, diagnoses, or dates of
  birth.
- `extractFieldPaths()` (in `discovery.ts`) is a pure function that reads
  object **keys** only; it inspects a value's `typeof`/array-ness purely to
  decide whether to recurse, and never serializes or returns a value.
- Raw IDs are not included in sample field lists beyond what's necessary to
  name the field itself (e.g. `client.id` is reported as a field name that
  exists — the actual ID value behind it is never read into the discovery
  output).
- No fixture in this codebase contains real PHI — all test fixtures are
  hand-authored, fictional data.

## Client Privacy Policy

**Live finding:** the `/api/clients` response (HTTP 200, 1 record)
exposes extensive sensitive fields even without requesting
`requestedSensitiveFields` explicitly — client records are, by nature, a
richer PII/PHI surface than visit records. This is a structural constraint
on how the production schedule path should be built, not just a discovery
concern:

- **The production Today's Schedule integration must not request
  `requestedSensitiveFields`** for clients or caregivers — enforced today
  by omission in `clients.ts`/`caregivers.ts`, and covered by a test that
  inspects the actual constructed request URL.
- **The production integration must not return full client objects** to
  any UI or API surface.
- **Must not expose:** addresses, dates of birth, email, phone, notes,
  medical fields, or billing fields — none of these are needed for
  schedule visibility.
- **Prefer the resident/client identity already available on Visit
  records** (`client.id`, `client.firstName`, `client.lastName`,
  `client.externalId` — all spec-confirmed visit field paths) instead of
  a separate client lookup. Visits already carry enough identity
  information for schedule display; a dedicated `/api/clients` call
  should not be needed for the schedule UI at all.

**No client-record UI was added in this task**, and none should be added
until a specific, reviewed need for it exists beyond schedule visibility.

## Sensitive Fields Are Not Requested

Even though the token has Clients Read Sensitive and Caregivers Read
Sensitive scope, `clients.ts` and `caregivers.ts` never send
`requestedSensitiveFields` — this discovery spike has no need for SSNs,
driver-license data, or other sensitive attributes, so the parameter
simply never appears in the request. Enforced by omission and covered by
a test that inspects the actual constructed request URL.

## Token Scope Recommendation

The token ("Serve OS — Read-Only Scheduling") currently carries six
scopes: Caregivers Read, **Caregivers Read Sensitive**, Clients Read,
**Clients Read Sensitive**, Schedules Read, Visits Read. This task did not
change the token — scope changes happen in the AxisCare admin console, by
Hud, not in code.

**Recommendation, not yet actioned:** *if live schedule mapping succeeds
using Visits alone, remove Clients Read Sensitive and Caregivers Read
Sensitive from the token as a least-privilege hardening step.* This is
explicitly a recommendation to verify later, not a claim that these scopes
are already unnecessary — the vendor-neutral `ServeScheduleVisit` mapping
task (next, not yet started) is what would actually prove whether Visits'
own `client.*`/`caregiver.*` fields are sufficient for schedule display
without ever calling `/api/clients` or `/api/caregivers` for identity
data. Until that mapping is verified, the sensitive-read scopes should
remain — removing them prematurely risks breaking a future need that
hasn't been ruled out yet.

## Schedule Status Normalization Policy

New this pass, in `lib/scheduling/status.ts`. `ServeVisitStatus` is
derived deterministically from four live-observed Visit fields (`removed`,
whether a caregiver is present, `clockIn.time`, `clockOut.time`) — never
from comparing against the current wall-clock time, and never from a
guessed `type`/`modificationReason.name` string match. Rule order (first
match wins): `removed` → `removed`; clock activity with no caregiver on
record → `unknown` (an anomaly, not silently resolved either direction);
`clockOut.time` present → `completed`; `clockIn.time` present alone →
`in_progress`; no caregiver, not started → `unassigned`; otherwise →
`scheduled`. `cancelled` and `missed` are deliberately never produced by
this function — no confirmed AxisCare indicator exists for either yet;
full reasoning in `status.ts`'s module comment and
[`docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`](../architecture/SERVE_SCHEDULING_INTELLIGENCE.md).

## No-Write Policy

Enforced structurally, not just by convention: `axisCareGet()` is the only
HTTP-calling function in the integration, its `fetch()` call hardcodes
`method: "GET"`, and there is no parameter to override it. Adding a write
capability would require a new function, not a flag on this one.

## CINCH Provenance Question

**Open question:** *Can CINCH-originated community-care visits be reliably
distinguished within the AxisCare API response?*

We expect AxisCare may later expose CINCH CCM community-care schedule data
once that vendor integration activates, but this is not assumed to already
be happening. `discovery.ts` scans observed field *names* (never values,
never visit duration) for evidence of: service type, visit type, program,
branch, source system, community care, track, short visit, external
source, integration origin, service code, and location. The result is
reported as `cinchProvenanceFieldNames` — a list of field names that
matched, with an explicit caveat that a matching field name is not proof
that any given visit actually originated from CINCH.

Now that the real visit field paths are spec-confirmed (`service.id`,
`service.code`, `service.description`, `service.procedureCode`, `type`,
`modificationReason.id`, `modificationReason.name`, etc.), the matching
logic was corrected to normalize the **full dotted path**, not just the
last segment — matching only `code` against the `service` object's `code`
field would never catch the compound concept `service.code` /
`servicecode`. `service.code` is now confirmed (via test) to match; the
narrower `service.procedureCode` deliberately does not, since
"procedureCode" isn't one of the concept-phrases given.

**Live finding:** the first live discovery run observed two matching field
names:

- `service.code` — exists on visit records
- `community` — exists on client records

**Neither currently proves CINCH origin.** A field name matching a
provenance keyword only means the field exists — this integration never
reads or reports field *values*, and provenance cannot be established from
a field name alone (nor, per the task's explicit instruction, from short
visit duration alone). `service.code` is a generic service-classification
field that predates any CINCH integration; `community` on a client record
plausibly just names the client's residential community (e.g. Watermere),
not a data-source system.

**Future verification method:** compare a known CINCH community-care
visit's record across three places — CINCH itself, AxisCare's Real Time
View, and a live `GET /api/visits` response — after the CINCH↔AxisCare
vendor integration activates. Only a same-visit, cross-system comparison
like this (done by a human, off-platform, with real records) can establish
whether `service.code`, `community`, or some other field reliably
distinguishes CINCH-originated visits. This integration's role is limited
to making that comparison possible by surfacing field *names* — it cannot
perform the comparison itself.

This question remains **unanswered** until that cross-system verification
happens.

## Live Time-Field Findings (2026-07-12)

Resolved via `npm run schedule:preview`'s aggregate-safe output (see
[`docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md`](../architecture/SERVE_SCHEDULING_INTELLIGENCE.md)'s
"Live Validation Results" for full detail):

- **AxisCare's live `timezone` field value is `"US/Central"`** — a legacy
  IANA alias for `America/Chicago`. All 4 active visits carried this
  value; the `America/Chicago` fallback was never exercised live.
- **`scheduledStartDate`/`scheduledEndDate` vs. `startDate`/`endDate`
  resolved:** all 11 source records had both pairs present and parseable;
  only 1 showed any difference (15 minutes). `normalize.ts`'s existing
  choice — `scheduledStartDate`/`scheduledEndDate` primary,
  `startDate`/`endDate` fallback — is now evidence-backed, not just a
  documented guess. No code change was needed.
- **Every active visit's `scheduledStart`/`scheduledEnd` parsed
  successfully** — `countWithUnparseableScheduledTimes: 0` — confirming
  `dateTime.ts`'s dual-format handling works against real data, though
  the exact underlying wire format (offset-bearing vs. naive) still
  cannot be confirmed without reading a raw value, which this program
  never does.

## Other Unanswered Technical Questions

- Actual page-size limits and whether `limit` is respected exactly as
  requested for clients/caregivers.
- Rate-limit behavior and headers (nothing in this phase relies on rate
  limit headers being present).
- Whether `errors`/`success` ever appear on a 200-status response (i.e.
  partial success) — this phase's error handling is driven entirely by
  HTTP status code, not by inspecting a 200 response's `errors` array.
- What `results.caregiversNotFound` actually contains when caregivers are
  requested by ID (not exercised by this phase's `limit=1` request, which
  doesn't request specific IDs).
- The CINCH provenance question itself — see "Future verification method"
  above.
- Whether a real multi-page Visits response ever actually occurs — the
  bounded page-following logic in `getTodaysVisitsBounded()` has only been
  verified against fake, always-paginating fixtures, not a real busy day.

## Next Recommended Engineering Step

1. Hud runs `npm run schedule:preview` locally (or reviews a future
   Workspace integration) to sanity-check the normalized schedule against
   a real day's data — sanitized output only, safe to share.
2. Verify whether Visits' own `client.*`/`caregiver.*` fields are
   sufficient for schedule display without a separate `/api/clients` or
   `/api/caregivers` call — this determines whether the Token Scope
   Recommendation above can be actioned.
3. Once real date/time field values are visible to Hud (off-platform),
   confirm or correct `lib/scheduling/dateTime.ts`'s two-format assumption
   and `normalize.ts`'s `scheduledStartDate`-preferred-over-`startDate`
   choice.
4. Build the Workspace Today's Schedule UI on top of
   `getAxisCareTodaysSchedule()` — explicitly out of scope for this task
   (Part M), but this is the natural next consumer.
5. When ready to compare a known CINCH community-care visit across
   systems (see CINCH Provenance above), populate
   `lib/scheduling/normalize.ts`'s `CARE_MODEL_BY_SERVICE_CODE` with the
   confirmed mapping — currently empty by design.

## Testing

No unit-test framework (jest/vitest/mocha) exists in this repository, and
none was added for this spike — see
`lib/integrations/axiscare/__tests__/sanitization.test.ts`'s header comment
for the reasoning. Instead, a small dependency-free assertion script using
Node's built-in `node:assert/strict` covers: missing-configuration
detection, non-HTTPS base-URL rejection, base-URL-ending-in-`/api`
rejection, token-never-exposed checks on the configuration state, HTTP
status-to-category mapping, error-message redaction, non-JSON response
handling, a 401-with-sensitive-body handled without leaking that body,
field-name extraction/CINCH-keyword matching (including the full-path-vs-
last-segment regression case) against fictional nested fixtures,
`results.visits`/`results.clients`/`results.caregivers`/`results.nextPage`
extraction, `normalizeCollection()`'s array/keyed-object/single-object/
empty classification (including a fixture with deliberately
non-overlapping outer-key vs. inner-value strings, so the
never-leak-the-map-keys assertion can't pass by accident), a
`results.schedules` test covering all three possible shapes, a fictional
sensitive-client-field fixture proving field names may appear while
values never do, and — via a request-capturing fake `fetch` — that
`X-AxisCare-Site-Number` is never sent, that `getTodaysVisits()` and
`getScheduleSample()` both send identical same-day `startDate`/`endDate`,
and that `requestedSensitiveFields` is never present on client/caregiver
requests. 31 tests, run with `npm run test:axiscare`. **Known
limitation:** real `AbortController`/timeout behavior is not exercised by
this suite — it would require either a real slow endpoint or a
fake-timers harness, both out of scope for a dependency-free pure-function
suite; timeout behavior is only exercised by an actual run of the
discovery script.

**`lib/scheduling/` tests (new this pass):** same convention, four files,
38 tests total, run together with `npm run test:scheduling`:
`__tests__/dateTime.test.ts` (Central Time parsing, explicit-offset
parsing, and an explicit spring-forward DST boundary comparison — a naive
time one day before vs. one day after 2026-03-08 resolves to UTC instants
exactly one hour apart), `__tests__/status.test.ts` (all deterministic
status rules, including the ambiguous-clock-activity-without-a-caregiver
→ `unknown` case), `__tests__/normalize.test.ts` (display-name
construction, a dedicated privacy-boundary test asserting a
`ServeScheduleVisit`'s keys are *exactly* its declared type — nothing from
a fictional sensitive-field-laden raw fixture rides along — and schedule
normalization), and `__tests__/todaysSchedule.test.ts` (summary counts,
`not_configured`/`authentication` unavailable states, and the bounded
pagination + hostname-validation logic, including a fake-fetch fixture
that always claims another page exists, proving the crawl stops at the
hardcoded bound rather than a natural end).
