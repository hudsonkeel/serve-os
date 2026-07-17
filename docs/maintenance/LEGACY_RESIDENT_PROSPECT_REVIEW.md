# Legacy Resident Prospect Review

One-time audit produced during the prospect-consolidation scope (see
`docs/design/RELATIONSHIPS.md`, "A prospect is a Relationship type, not a
Resident classification"). Records the exact set of residents the legacy
Serve Prospect classification affected, why, and what — if anything —
should happen next. This is a point-in-time maintenance artifact, not a
living document; it will not be updated as new Relationships are created.

## How "Serve Prospect" residents were actually being produced

Before this scope, a resident showed under the Residents module's "Serve
Prospects" tab / badge when `CommunityResidentRecord.serveRelationshipStatus`
resolved to `"prospect"`. Two possible sources fed that value
(`lib/data/communityMetrics.ts`, `mapResidentToRecord()`):

1. `residents.serve_relationship_status` (the resident's own persisted
   field).
2. Staged data in `resident_relationship_imports` (`is_prospect` /
   `serve_relationship_status` columns), matched to a resident at **read
   time** by `stagedServeRelationshipStatus()` — this staged value takes
   priority over the persisted one when both exist.

**Finding: source 1 does not exist in the live database.** The migration
that would add `residents.serve_relationship_status`
(`20260702000000_add_resident_serve_relationship_status.sql`) is present in
this repo's migration history but was never applied to the live Supabase
project — confirmed by direct schema inspection (`select * from residents
limit 1` returns no such column). This means **every** "Serve Prospect"
resident visible in the live app, before this scope, was produced entirely
by source 2: staged `resident_relationship_imports` data, re-matched to a
resident row on every page load via name+unit or external-key matching —
never a real column on the resident's own record.

This also means Active Client / On Hold / Former Client classifications
were (and remain, after this scope) driven the same way — by staged import
data, not a persisted resident column. Nothing in this scope changes that;
only the `'prospect'` value is collapsed to `'none'` before it reaches the
UI (`collapseLegacyProspectStatus()` in `lib/residents/search.ts`).

## The audit

Every `resident_relationship_imports` row with `is_prospect = true` (20
rows) was matched to a live, active resident using the exact same logic
the app itself uses (`mapImportsToResidents()`'s direct-key-then-name-unit-
fallback matching in `lib/data/communityMetrics.ts`). Two rows didn't match
any resident at all (see "Unmatched import rows" below); the remaining 18
rows resolved to **16 distinct residents** (two pairs of import rows
resolved to the same resident — see "Data quality notes" below).

For each of the 16 residents, the following signals were checked directly
against the live database: any `relationships` row (any type, any
status), `family_contact_name`, `needs_review`, any `resident_working_notes`
row, and any current (`is_current = true`) `resident_current_needs` row.

| Resident | Unit | Family Contact | Needs Review | Active Relationship | Working Note | Current Needs | Classification |
|---|---|---|---|---|---|---|---|
| Kathryn Brown | 9301 | — | — | No | No | No | C |
| Bobbie Burkett | 6304 | — | — | No | No | No | C |
| Gloria Evans | 1411 | — | — | No | No | No | C |
| Brenda Fritschen | 7204 | — | — | No | No | No | C |
| Jerry West | 6303 | — | — | No | No | No | C |
| Gerald Gould | 3405 | — | — | No | No | No | C |
| Kathryn Morshed | 8301 | — | — | No | No | No | C |
| Elizabeth Maxwell | 7313 | — | — | No | No | No | C |
| Amy Nickell-Willson | 10405 | — | — | No | No | No | C |
| Barbara Powers | 2104 | — | `missing_phone` | No | No | No | C |
| LaJuana Quarles | 8102 | — | — | No | No | No | C |
| Barbara Schmid | 10307 | — | — | No | No | No | C |
| Janice Seiden | 6308 | — | — | No | No | No | C |
| Marion White | 9310 | — | — | No | No | No | C |
| Virginia Wynn | 9306 | — | — | No | No | No | C |
| Ada Washington | 6306 | — | — | No | No | No | C |

**Result: all 16 are Category C — no evidence of active engagement; the
legacy classification is removed from the UI (already done, app-wide, by
this scope) and no Relationship is created automatically.** Every signal
checked was negative for every single resident: no family contact on
file, no review flags beyond one unrelated `missing_phone` note, zero
Working Notes, zero current-needs documentation, and — critically — zero
existing `relationships` rows of any kind. There is no data-supported
basis to create a Resident Prospect Relationship for any of them without a
human first confirming a real, current opportunity exists.

No residents fell into category A (active Relationship already present)
or B (strong evidence of active opportunity) — both are structurally
impossible for A here since this audit is the reason Relationships exist
to check against, and B would require some contact/note/needs signal that
none of the 16 have.

## Unmatched import rows (Category D — uncertain)

Two `resident_relationship_imports` rows tagged `is_prospect = true` did
not match any current resident record at all, so they produce **no**
visible effect in the app today (with or without this scope's changes) —
listed for completeness, not because any action is needed:

| Import row (name as staged) | Unit | Match result |
|---|---|---|
| Johnny Quarrels | 8102 | Unmatched — unit 8102's current resident (LaJuana Quarles) matched via a different import row's external key; no separate resident record exists for "Johnny Quarrels" |
| Carolyn Rikee | 10201 | Unmatched — no resident external key or name+unit match found |

## Data quality notes (pre-existing, not introduced by this scope)

Two pairs of import rows carry an `resident_external_source_key` that
doesn't match the name on the import row itself:

- **"Jerald Maxwell"** (import row) shares its external key with
  **"Elizabeth Maxwell"** (a different import row, unit 7313) — both
  resolve to the same resident record (Elizabeth Maxwell). Likely a
  spouse's row mistakenly tagged with the wrong external key during
  upstream CSV processing.
- **"Elliot Goldberg"** (import row, unit 6303) carries the external key
  for the resident currently named **"Jerry West"** at that unit — the
  same "source name differs from resident roster" condition the app
  already surfaces elsewhere (`sourceNameDiffers` /
  "Source Identity Review" on the resident detail page).

Neither is a defect introduced by this scope, and neither changes the
Category C conclusion above (both residents still show zero engagement
signals) — noted here only so a future data-quality pass on the import
pipeline has a starting point.

## What happens to these residents now

Nothing automatic. Their resident records are untouched — this scope never
writes to `residents` or `resident_relationship_imports`. If Brian
identifies a real opportunity for any of them, the normal "Start
Relationship" entry point on that resident's page (or "Add Resident
Prospect" from Relationships) creates a proper, auditable Relationship at
that time — the same path used for every other Resident Prospect.
