# Test Data Hygiene

Status: policy established during the Relationship Action Board / Whiteboard
phase, applies to all future scopes. See "Known Doris Kakazu cleanup" below
for the incident that prompted it.

## The problem this solves

Earlier Relationship CRM verification (and, before that, Resident Memory
verification) created synthetic records directly against the live Supabase
database — the only database this app has. Some of that data was clearly
labeled ("VERIFY TEST", "LIFECYCLE TEST"); some wasn't ("Resident Check-in",
"App-level verification save #1."). None of it was tracked in one place, so
cleaning it up later required re-deriving what was synthetic from context
clues and actor names rather than a deterministic list. This document fixes
that going forward.

## Unit and integration tests

Prefer, in this order:
1. Isolated fixtures / a local test database.
2. Transaction rollback around the test.
3. Mocks, only where genuinely appropriate.
4. Deterministic, tracked cleanup (below) — only when 1-3 aren't practical,
   which in this codebase today means: whenever a test needs to exercise a
   real Postgres RPC (this app's atomic-write pattern — see AGENTS.md/
   CLAUDE.md conventions — means most business logic lives in `plpgsql`
   functions, not application code, so pure-logic unit tests
   (`lib/*/__tests__/*.test.ts`) cover what they can, and everything else is
   live-database verification under the rules below).

## Live-database verification

Allowed only when necessary, and only under this rule: **every synthetic
root record must carry a deterministic marker.**

Naming pattern:

```
__SERVE_TEST__ <purpose> <run-id>
```

Example:

```
__SERVE_TEST__ relationship-action-edit 20260716T143200Z-a81f
```

Where a table has a dedicated metadata mechanism, prefer that over parsing
the display name — see "Metadata mechanism" below. The name marker is the
fallback for tables (or existing rows, pre-dating this policy) that don't
have one.

`lib/relationships/testMarker.ts#generateTestMarker(purpose, now?, runId?)`
produces this format deterministically (unit-tested in
`lib/relationships/__tests__/testMarker.test.ts`) — use it rather than
hand-formatting the string, so every marker this app generates is
guaranteed parseable by `isTestMarker()` and by
`scripts/cleanup-test-data.ts`.

Every verification run must record, before touching the database:
- a unique run identifier (timestamp + short random suffix, as in the
  example above, is sufficient — it never needs to be cryptographically
  strong, only distinguishable from other runs)
- what root record(s) will be created and why
- the exact root IDs, once created (not just their names — IDs are what
  cleanup actually keys on)

## Metadata mechanism

Preference order, evaluated per table/feature (Part 4 of the scope that
established this policy):

1. An existing metadata JSON field, if the table already has one.
2. Existing `source_type`/`source_record_id` fields, if present and a
   `"test"`/`"verification"` value is a legitimate fit.
3. A controlled, narrowly-scoped marker column on the **root** entity only
   — e.g. `relationships.test_marker` (added in
   `20260718000000_add_relationship_test_marker.sql`). Every dependent
   table (`relationship_actions`, `relationship_touches`,
   `relationship_stage_history`, `relationship_timeline`,
   `relationship_working_notes`, `relationship_service_opportunities`) is
   reachable by joining back through `relationship_id`, so cleanup never
   needs its own marker column on every table — one root marker is enough
   to identify an entire run's footprint.
4. Deterministic name markers plus a tracked ID list, when a schema change
   isn't warranted for a one-off verification.

Rules for whichever mechanism is used:
- Never add `is_test_data` (or equivalent) to every table casually. Ask
  "does this table's root entity already carry a marker I can join
  through?" before adding a new column anywhere.
- Never expose the marker in normal application UI — no create/edit form
  a real user can reach sets it. `create_relationship()`'s `p_test_marker`
  parameter is service-role-only (the RPC itself is `revoke ... from
  public; grant ... to service_role`, same as every write RPC in this
  app) and is never passed by `lib/actions/relationships.ts`'s
  `createRelationship()` — only a verification script calling the RPC
  directly sets it.
- Never let an ordinary authenticated user mark a real record as
  synthetic after the fact. The marker is set once, at creation, by a
  script — not editable through the app.

## Cleanup is part of the test, not an optional final step

A verification run is **incomplete** until:
1. Every root record created for the run is removed.
2. Every dependent record (audit rows, Timeline events, stage history,
   touches, actions, working notes, service opportunities — whatever the
   feature under test touches) is removed, in dependency order.
3. A verification query confirms zero rows remain matching the run's
   marker or ID list.
4. The linked real resident (if any test record was linked to one) is
   confirmed untouched — cleanup must never cascade into
   `residents` or any other non-synthetic table.

Cleanup runs through a controlled, service-role-only script or one-time
migration — never through an app-facing delete control. See
`scripts/cleanup-test-data.ts`.

## Append-only does not mean "never delete"

Append-only, as used throughout this codebase's audit tables
(`relationship_timeline`, `relationship_stage_history`,
`relationship_action_edits`, `resident_current_needs` version history,
etc.), means:
- normal application users cannot rewrite or erase legitimate operational
  history through the app, and
- every real change leaves a permanent, ordered trail.

It does **not** mean:
- synthetic engineering data must be preserved forever,
- a service-role maintenance script can never remove known test fixtures, or
- test pollution in a shared database is an acceptable cost of doing
  verification.

`scripts/cleanup-test-data.ts` runs with the service-role key, outside the
app's request path, and is the one sanctioned way to delete rows from these
tables — it is not a precedent for adding a delete button anywhere in the
UI.

## Completion reports

Any completion report for a scope that did live-database verification must
include:
- the run identifier
- exactly which records were created (table + ID)
- exactly which records were removed
- the cleanup verification result (a query showing zero remaining matches)
- any data intentionally preserved and why (e.g. a record that couldn't be
  confidently classified as synthetic)

## Known Doris Kakazu cleanup (historical record)

During the phase that established this policy, an investigation found the
following pre-existing synthetic records tied to the resident "Doris
Kakazu" (`3d2253e6-a972-4aa2-9e3d-fc54316e7702`), created across several
earlier verification passes before this policy existed:

- 2 `relationships` rows (`414f18d8-...`, `559656a6-...`) and their full
  dependent footprint (stage history, touches, actions + edits, Timeline
  events)
- 2 `resident_wellness_follow_ups` rows ("Resident Check-in",
  "Dismiss-After-Edit Test") and their 7 `resident_wellness_follow_up_edits`
  audit rows
- 2 `resident_working_notes` rows (both literally content "Verification
  working note — testing resolve/archive flow.")
- All 8 `resident_current_needs` version-history rows for Doris (the entire
  history — every version's content was a verification artifact:
  "Verification: ...", "LIFECYCLE TEST v-A/B/C ...", "App-level
  verification save #1.", or the empty-state placeholder text)
- 15 of 16 `resident_timeline` rows for Doris (every row generated as a
  byproduct of the records above)

One `resident_timeline` row was explicitly preserved: `resident_created`
("Resident created"), `created_by: null` — the genuine event marking when
Doris's resident record was actually created. It carried none of the
verification-script markers the other 15 rows did, and deleting it would
have destroyed real (if minor) operational history for no reason.

Doris Kakazu's own `residents` row was never touched. See the completion
report for the scope that ran this cleanup for the exact removal counts
and verification query results.

## See also

- `docs/design/RELATIONSHIPS.md` — the Relationship CRM data model this
  policy's marker mechanism is built into.
- `scripts/cleanup-test-data.ts` — the cleanup script itself.
