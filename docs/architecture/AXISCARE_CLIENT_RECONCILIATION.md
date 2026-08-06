# AxisCare Client Reconciliation — Operational Reconciliation Report

Post-Release Stabilization, AxisCare Operational Synchronization,
Workstream 2 ("Operational Client Synchronization, Phase 1"). Read-only
against the live AxisCare API (`GET /api/clients`, full pagination, 25
real records — confirmed unchanged since the prior pass) and the live
`residents` table (331 rows), using the same authenticated AxisCare
client (`lib/integrations/axiscare/client.ts`) the now-working schedule
integration uses. **No resident or client record has been created,
linked, or modified — see the blocker below.**

## BLOCKER — Phase 4 cannot execute yet

`supabase/migrations/20260819000000_add_resident_axiscare_client_sync.sql`
is not applied to the live database (confirmed fresh, moments before this
report: `sync_axiscare_client_identity` does not exist in the live
schema). Applying it requires executing DDL (`ALTER TABLE`,
`CREATE FUNCTION`) against Postgres directly. I have no mechanism to do
that — only the Supabase **data-layer** service-role key (PostgREST),
which can read/write rows in already-existing tables and call
already-existing functions, but cannot run DDL. I don't have a direct
Postgres connection string or a Supabase account-level management token.

**I checked whether there's a safe workaround using only existing,
already-writable columns — there isn't.** All six Stage-A confirmed
matches already have `residents.external_source_key` and `source_system`
populated with real Watermere roster-CSV provenance (e.g.
`"watermere-frisco-2402-cecilia-perry-253"` / `"Watermere resident roster
CSV"`). Writing AxisCare data into those same columns would destroy that
existing provenance — exactly the "never overwrite Serve-owned resident
information" this task prohibits. This confirms the migration is a
genuine, correctly-scoped prerequisite, not excess caution.

**What's needed to unblock:** someone with Supabase SQL-editor or direct
database access needs to run the migration file above (already reviewed
below for safety and rollback). Once applied, `scripts/syncAxisCareClientIdentities.ts`
(written, not yet run) executes Stage A exactly as specified and can be
run immediately — no further code work is needed.

## Migration safety review (required before applying — now complete)

- **Forward-only:** confirmed — no `DROP TABLE`/`DROP COLUMN`/`DELETE`/`TRUNCATE` anywhere in the file.
- **Matches live schema:** confirmed — `person_vendor_identity_links` and `person_documents` both exist live today with the exact `workforce_member`-only constraint this migration widens.
- **No destructive statements:** confirmed — the two `alter table` statements only widen an existing allow-list; every row that satisfied the old constraint still satisfies the new one. The new function only ever inserts a `'proposed'` row it owns or updates a row it already owns (`source_system='axiscare'`, `subject_type='resident'`) — structurally cannot touch `workforce_member` rows or any human-entered decision.
- **Rollback documented:** added directly to the migration file as an executable comment block (exact `DROP FUNCTION`/constraint-narrowing statements).

## Phase 1 — Real AxisCare client data (refreshed, current)

25 live clients, same authenticated client used by the schedule feature. Full field capture per client: AxisCare ID, name, `status.active`/`status.label`, `classes[]`, `administrators[]` (6 of 25 populated, e.g. `elizabeth.butler@servecaregiving.com`), `community`, `personalEmail`/`billingEmail`, `homePhone`/`mobilePhone`/`otherPhone`, `startDate`, `effectiveEndDate` (only 1 of 25 has a value — Maryann Smith, `2027-05-28`). **No `externalStatus` field exists anywhere in the real AxisCare response** — confirmed by inspecting the full key union across all 25 records twice, in two separate sessions. If AxisCare exposes this concept, it is not present on the `/api/clients` list response.

## Phase 2 — Deterministic reconciliation (unchanged, already implemented and tested)

`lib/integrations/axiscare/clientLifecycle.ts` (6 tests) and `clientIdentityMatching.ts` (11 tests) — see prior investigation for the full mapping table. Order: confirmed AxisCare ID link (none exist yet) → confirmed vendor identity link (n/a for residents yet) → email → phone → name+apartment → name+community → everything else is Needs Review. **Never** auto-matches on name alone.

## Phase 3 — Full reconciliation table (all 25 live records, current)

| AxisCare | Serve Resident | Confidence | Proposed Status | Action |
|---|---|---|---|---|
| #1 Client Lead | — | — | — | Exclude (placeholder) |
| #2 Sarah Adams | — | — | Inactive Client | Needs review (unmatched) |
| #3 Watermere at Frisco Community | — | — | — | Exclude (community's own record, not a person) |
| #4 Maryann Smith | — | — | Inactive Client | Needs review (unmatched) |
| #5 Diane Vento | — | — | Inactive Client | Needs review (unmatched) |
| #6 Jeremy Goldberg | — | — | Needs Review | Needs review (thin record) |
| #7 Linda Kaplan | — | — | **Active Client** | **Needs review (unmatched active client)** |
| #8 Hank Azeria | — | — | Needs Review | Needs review (thin record) |
| #9 Elliott Goldberg | — | — | **Active Client** | **Needs review (unmatched active client)** |
| #10 Serve Office | — | — | — | Exclude (internal record) |
| #11 Michelle (Mick) Helsley | — | — | **Active Client** | **Needs review (unmatched active client)** |
| #12 Doris Kakazu | — | — | **Active Client** | **Needs review (unmatched active client)** |
| #13 Kathryn (Kathy) Morshed | — | — | **Active Client** | **Needs review (unmatched active client)** |
| #14 Integration Test | — | — | — | Exclude (test record) |
| #15 Micah Test | — | — | — | Exclude (test record) |
| #16 John McKey | — | — | **Active Client** | **Needs review (unmatched active client)** |
| #17 Cecilia Perry | Cecilia Perry | Confirmed (phone) | Active Client | Link to resident |
| #18 New Client | — | — | — | Exclude (placeholder) |
| #19 Adrian Reyes | Adrian Reyes | Confirmed (phone) | Prospect | Link to resident |
| #20 Delia Reyes | Delia Reyes | Confirmed (phone) | Prospect | Link to resident |
| #21 Wilma Pinion | Lynell Pinion | Probable — name mismatch | Prospect | Needs review |
| #22 Pamela Hatch | Pamela Hatch | Confirmed (email) | Prospect | Link to resident |
| #23 Robert Hatch | Pamela Hatch (same as #22) | Probable — name mismatch + duplicate target | Prospect | Needs review |
| #28 Rubyetta Cain | Rubyetta Cain | Confirmed (phone) | Active Client | Link to resident |
| #29 Brenda Fritschen | Brenda Fritschen | Confirmed (phone) | Active Client | Link to resident |

## Totals

- **AxisCare Active count:** 11 raw / **9 real** (excludes Watermere at Frisco Community #3 and Serve Office #10)
- **AxisCare Inactive count:** 14 raw / **8 real, non-prospect** minus classification: 3 Inactive Client (Sarah Adams, Maryann Smith, Diane Vento), 5 Prospect (Adrian, Delia, Wilma, Pamela, Robert), 2 Needs Review-thin (Jeremy, Hank), 4 excluded placeholders (Client Lead, Integration Test, Micah Test, New Client)
- **Serve Active Clients (current, before any sync):** 0 — no resident has ever been linked to AxisCare
- **Serve Inactive Clients (current):** 0
- **Match percentage:** 6/25 = 24% confirmed, 2/25 = 8% probable/ambiguous, 11/25 = 44% unmatched (6 of which are currently-active AxisCare clients — the highest-priority gap), 6/25 = 24% excluded
- **Remaining unmatched AxisCare clients:** Sarah Adams, Maryann Smith, Diane Vento, Jeremy Goldberg, Hank Azeria, Linda Kaplan, Elliott Goldberg, Michelle Helsley, Doris Kakazu, Kathryn Morshed, John McKey (11 total, 6 of them active)
- **Remaining unmatched residents:** all 331 residents except the 6 confirmed + 2 ambiguous targets (325) — expected and correct: most Watermere residents are not AxisCare clients at all, and this reconciliation only ever links FROM AxisCare TO an existing resident, never the reverse
- **Ambiguous identities:** 2 — Wilma Pinion (possible Lynell Pinion, phone match/name mismatch), Robert Hatch (possible shared record with Pamela Hatch, phone match/name mismatch + two AxisCare clients would map to the same resident)

## What was implemented this pass

- Rollback documentation added directly to the migration file.
- `scripts/syncAxisCareClientIdentities.ts` — the exact Stage A execution script, ready to run the moment the migration is applied. Processes only deterministic, name-agreeing email/phone matches; defers everything else untouched.
- This report, refreshed against current live data using the same authenticated AxisCare client the schedule feature uses (no new/duplicate integration path).

## STOP — no production write performed

Six confirmed links, two review-queue proposals, and zero resident
creations are the entire scope of what Stage A/B/C authorize — and none
of it has executed, because the schema it depends on isn't live yet.
This is not a policy choice; it's a hard capability limit for this
session. The next action is entirely non-code: applying the migration.
