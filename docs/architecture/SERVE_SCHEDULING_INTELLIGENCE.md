# Serve Scheduling Intelligence Architecture

## Permanent Rule

> AxisCare remains the authoritative scheduling and visit-execution
> system. Serve OS consumes the minimum necessary read-only data to
> provide visibility, exception management, and operational intelligence.
> Write access will not be implemented unless a specific, repeated
> workflow demonstrates that read-plus-deep-link resolution is
> insufficient.

This rule governs every phase below. It is not revisited casually — a
future write-access decision requires demonstrated operational evidence,
not convenience.

## Phase 1 (current)

- **Read-only AxisCare visibility** — `lib/integrations/axiscare/`, a
  server-only, GET-only client for Visits, Schedules, Clients, and
  Caregivers. Live-verified against the real API (see
  [`docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md`](../integrations/AXISCARE_READ_ONLY_INTEGRATION.md)
  for the full discovery record).
- **Normalized Serve schedule model** — `lib/scheduling/`, a vendor-neutral
  domain (`ServeScheduleVisit`, `ServeRecurringSchedule`,
  `ServeTodaysScheduleResult`) that the rest of Serve OS consumes instead
  of raw AxisCare records. See "Domain Model" below.
- **Workspace Today's Schedule** — not built in this task (explicitly
  deferred). `getAxisCareTodaysSchedule()` is ready to be called from a
  future Workspace page; no UI work has started.
- **Deterministic exceptions** — status normalization
  (`lib/scheduling/status.ts`) surfaces `unassigned`/`unknown` visits from
  explicit field evidence only. No time-based "missed" inference exists
  yet — see "Status Normalization" below for why, and where that logic
  belongs instead.
- **Observation period with Elizabeth** — before any exception rule beyond
  what's documented here is added (especially anything time-based, like a
  "missed visit" alert), the plan is an observation period with Elizabeth
  (operations) to confirm what AxisCare's own fields actually mean in
  practice and what staff currently rely on, rather than encoding
  assumptions.

## Domain Model

`lib/scheduling/types.ts` defines the vendor-neutral types. Summary (see
the file itself for full field lists):

- **`ServeScheduleVisit`** — one visit, normalized from an AxisCare Visit
  record. Carries resident/caregiver display identity, service identity,
  normalized UTC timestamps, a deterministic `status`, and
  `careModel`/`provenanceConfidence` (both `unknown` until a mapping is
  explicitly verified — see "Care Model / CINCH Provenance" below).
- **`ServeRecurringSchedule`** — optional recurring-plan context from
  AxisCare Schedules, normalized but not yet consumed by any UI.
- **`ServeTodaysScheduleResult`** — the top-level result of
  `getAxisCareTodaysSchedule()`: either `available: true` with
  `visits`/`activeVisits`/`summary`/`timeFieldAudit`/`pagination`, or
  `available: false` with a sanitized reason and message — never a raw
  AxisCare error. See "Source Records vs. Active Visits" below for why
  there are two visit lists.

**Privacy boundary (enforced, not just documented):** `ServeScheduleVisit`
never carries phone numbers, addresses, dates of birth, email, notes,
diagnoses, billing fields, `chargeRate`, `billableRateMode`, or a full raw
client/caregiver object. `lib/scheduling/__tests__/normalize.test.ts`
asserts this directly — a fictional fixture with sensitive fields
attached, then a check that the normalized object's keys are *exactly*
`ServeScheduleVisit`'s declared field set, nothing extra. The same
guarantee extends to `summary` and `timeFieldAudit`, both pure aggregate
counts/durations — `__tests__/todaysSchedule.test.ts`'s "privacy
boundaries remain intact" test asserts a fictional record's SSN, name, and
raw record ID never appear anywhere in a serialized `ServeTodaysScheduleResult`.

## Source Records vs. Active Visits (Removed Visit Policy)

Live discovery on 2026-07-12 surfaced a real counting bug: of 11 AxisCare
visit records, 7 were `removed`, and the original summary logic counted
every record's caregiver presence into a single broad
assigned/unassigned split — a removed visit with no caregiver inflated
"unassigned" as if it were actionable coverage (8 of 11 "unassigned,"
when only 1 of the 4 *active* visits actually needed a caregiver
assigned).

**Policy, now enforced by `ServeScheduleSummary`'s shape (types.ts) and
`summarizeVisits()` (todaysSchedule.ts):**

- **Removed records remain available in the normalized result** —
  `ServeTodaysScheduleResult.visits` includes every successfully
  normalized record, removed or not. They are never silently discarded at
  the integration layer, because they may matter later for audit and
  variance analysis (e.g. "how often does AxisCare mark a scheduled visit
  removed, and when").
- **They are excluded from active schedule and coverage counts.**
  `activeVisitCount`, `activeAssignedCount`, `activeUnassignedCount`, and
  all five normalized-status counts (`scheduledCount`/`inProgressCount`/
  `completedCount`/`missedCount`/`unknownCount`) only ever describe visits
  with `status !== 'removed'`.
- **They should not appear in the main Today's Schedule list.**
  `ServeTodaysScheduleResult.activeVisits` (a strict subset of `visits`,
  same relative order) is the UI-ready list — the first Workspace
  schedule view should default to rendering `activeVisits`, not `visits`.
- **A future disclosure such as "7 removed visits" may be shown
  separately** if operationally useful (`summary.removedVisitCount`
  already provides this number) — but as a distinct, clearly-labeled
  figure, never blended into "unassigned" or any active count.
- **Removed visits are never called "missed" or "cancelled."** AxisCare's
  `removed` flag is the only evidence available for these records; no
  live-observed `type` or `modificationReason.name` value is known to
  mean either of those, and inventing that interpretation would be
  exactly the kind of unsupported guess this program avoids. A removed
  visit's `status` is `"removed"` — a distinct value, not folded into
  `"missed"` or `"cancelled"`.

## Status Normalization

`lib/scheduling/status.ts`'s `determineVisitStatus()` — see that file's
module comment for the complete, line-by-line rule rationale. Summary:

| Rule | Trigger | Result |
|---|---|---|
| 1 | `removed === true` | `removed` |
| 2 | Clock activity recorded but no caregiver on record | `unknown` (contradictory data — reported, not resolved either way) |
| 3 | `clockOut.time` exists | `completed` |
| 4 | `clockIn.time` exists, `clockOut.time` doesn't | `in_progress` |
| 5 | No caregiver, not started | `unassigned` |
| 6 | Otherwise | `scheduled` |

**`cancelled` and `missed` are deliberately never produced.** Neither has
a confirmed AxisCare field/value backing it: no live-observed `type` or
`modificationReason.name` value is known to mean "cancelled," and
inferring "missed" from wall-clock time alone (current time past scheduled
end, no clock-in) is explicitly the pattern this function must not
implement — a genuinely missed visit and a caregiver who's simply running
late are indistinguishable from the visit record alone. **This is where
Community Intelligence / Scheduling Intelligence's future *exception*
layer belongs** (see "Future" below) — a separate, explicitly-designed
rule with context (route timing, caregiver history, day-of-week patterns)
that a raw status mapper has no business guessing at.

## Date/Time Behavior

`lib/scheduling/dateTime.ts`. The parser handles both plausible formats:
an explicit UTC/offset-bearing string (used as-is) and a naive wall-clock
string (interpreted as local time in the visit's own `timezone` field,
falling back to `America/Chicago`). Naive-time interpretation reuses the
same Central-Time offset technique already proven in `lib/utils/date.ts`,
generalized to any IANA timezone rather than hardcoded to Central — since
a visit's own timezone must take precedence when present. Never uses
`new Date(naiveString)` directly, which would silently apply the running
process's local timezone instead of the intended one. Explicit
spring-forward DST boundary test in
`lib/scheduling/__tests__/dateTime.test.ts`.

### Live Validation Results (2026-07-12)

Run via `npm run schedule:preview` — aggregate-safe output only, no
per-visit timestamps, names, or IDs:

- **All 4 active visits' `scheduledStart`/`scheduledEnd` parsed
  successfully** — `countWithUnparseableScheduledTimes: 0`.
- **1 of 4 active visits had recorded clock activity** (`actualStart`/
  `actualEnd` both present) — consistent with an 8am–10:30pm schedule
  window observed mid-day; the other 3 simply hadn't started yet or had
  no clock data recorded.
- **AxisCare's live `timezone` field value is `"US/Central"`** — a
  legacy/backward-compatible IANA alias for `America/Chicago`, not the
  canonical name. `Intl.DateTimeFormat` resolves it correctly (Node's
  ICU tzdata includes the alias), so `dateTime.ts` needed no change — but
  this is now a confirmed live fact, not a guess: `countUsingAxisCareTimezone: 4`,
  `countUsingAmericaChicagoFallback: 0` — every active visit carried its
  own timezone; the Central-Time fallback was not exercised live.
- **Schedule window:** earliest active `scheduledStart` observed at 8:00
  AM CT, latest active `scheduledEnd` at 10:30 PM CT — a plausible
  full-day home-care operating window.

### scheduledStartDate/scheduledEndDate vs. startDate/endDate — Resolved

Per `lib/scheduling/fieldPairAudit.ts`, run live against all 11 source
records (removed included, since the field-pair question is about data
quality, not visit status):

- **All 11 records had both field pairs present and both parsed
  successfully** (`recordsWithBothPairsPresent: 11`,
  `recordsWithBothPairsParsed: 11`).
- **Only 1 of 11 records showed any difference** between the two pairs
  (`recordsWithDifferingInstants: 1`), and that difference was a modest
  **15 minutes** (`min`/`maxAbsoluteDifferenceMinutes: 15`).

**Final decision: keep `scheduledStartDate`/`scheduledEndDate` as
primary**, `startDate`/`endDate` as fallback (already `normalize.ts`'s
behavior — no code change needed). This is no longer a documented guess;
it's now supported by live evidence that the two pairs agree in the
overwhelming majority of cases (10/11), and where they differ, the gap is
small and plausibly reflects a legitimate visit-level adjustment (e.g. an
actual start time shifting slightly from the original plan) rather than a
data-quality problem or a sign the two fields are unrelated. Their exact
semantic distinction (which one represents "as originally planned" vs.
"current/adjusted") remains unconfirmed — that would require inspecting
real values, which this program does not do — but the choice of which one
to treat as authoritative for `ServeScheduleVisit.scheduledStart`/
`scheduledEnd` is now evidence-backed.

## Care Model / CINCH Provenance

`careModel` defaults to `unknown` for every visit and schedule.
`lib/scheduling/normalize.ts`'s `CARE_MODEL_BY_SERVICE_CODE` mapping table
starts **empty** and stays empty until a specific AxisCare `service.code`
→ Serve care-model mapping has been explicitly verified — never populated
from inference (field presence, visit duration, etc.).

Live discovery found two field names that could plausibly relate to CINCH
provenance — `service.code` (on visits/schedules) and `community` (on
client records) — and confirmed **neither currently proves CINCH origin**.
A field name existing only means the field exists; this program never
reads field values, and duration-based inference is explicitly
disqualified.

**Future verification method:** compare a known CINCH community-care
visit's record across CINCH CCM, AxisCare's Real Time View, `GET
/api/visits`, and `GET /api/schedules` — a same-visit, cross-system,
human, off-platform comparison. Only that can establish which field (if
any) reliably distinguishes CINCH-originated visits. Once verified, the
mapping goes into `CARE_MODEL_BY_SERVICE_CODE` with
`provenanceConfidence: "confirmed"`.

## Pagination Policy

Two distinct pagination behaviors exist, for two different purposes:

- **Discovery** (`lib/integrations/axiscare/discovery.ts`) detects
  `results.nextPage` and reports it — never follows it. Discovery's job is
  to describe response shape, not assemble complete data.
- **Today's Schedule** (`lib/integrations/axiscare/visits.ts`'s
  `getTodaysVisitsBounded()`) needs a complete daily schedule, so it
  *does* follow `results.nextPage`, bounded: max 3 pages, max 500 total
  visits, and only after `validateNextPageUrl()` confirms the candidate
  value is HTTPS, matches the configured AxisCare hostname, and has an
  `/api/` path. A bare page number/cursor, mismatched hostname, non-HTTPS,
  or non-`/api` path all stop pagination rather than guess. If the bound
  is hit while AxisCare still indicates more data, the caller is told
  honestly via `pagination.hasNextPage: true` rather than silently
  truncating.

## Boundary Between `lib/integrations/axiscare/` and `lib/scheduling/`

- `lib/integrations/axiscare/` owns: AxisCare-specific paths, headers,
  envelope shapes, raw field types, HTTP/error handling, and pagination
  mechanics (URL validation, page bounds).
- `lib/scheduling/` owns: vendor-neutral types, status normalization,
  date/time normalization, display-name construction, and the
  privacy-filtered mapping from raw AxisCare records to Serve types.
- **Nothing outside `lib/integrations/axiscare/` should import an
  `AxisCareRaw*` or `AxisCare*Response` type.** The one exception is
  `lib/scheduling/normalize.ts` itself, whose entire job is that
  conversion.
- Future consumers (Workspace Today's Schedule UI, Community
  Intelligence) should import only from `lib/scheduling/`.

## Future

- Historical variance (comparing today's actual visit pattern against
  recurring-schedule expectations from `ServeRecurringSchedule`)
- Schedule snapshots (point-in-time captures for trend analysis)
- Webhook ingestion (if AxisCare offers it — not evaluated in this phase;
  explicitly out of scope per the read-only policy above until a
  read-plus-deep-link approach is proven insufficient)
- Contextual intelligence (the "missed visit" / exception layer described
  under "Status Normalization" above — designed deliberately, with
  Elizabeth's operational input, not inferred from raw fields)
- Community Intelligence integration (surfacing scheduling exceptions
  alongside resident wellness and relationship signals — see
  [`docs/architecture/SERVE_OS_OPERATING_MODEL.md`](./SERVE_OS_OPERATING_MODEL.md)'s
  Community Intelligence section)
- Explainable recommendations (any suggestion Serve OS surfaces must trace
  back to the specific field/rule that produced it — consistent with this
  phase's "unknown is preferable to an unsupported guess" discipline)
