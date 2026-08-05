# AxisCare Client Reconciliation — Dry-Run Report

Post-Release Stabilization, AxisCare Operational Synchronization,
Workstream 2. Read-only investigation against the live AxisCare API
(`GET /api/clients`, 25 real records — AxisCare's actual current client
list, not a synthetic sample) and the live `residents` table (331 rows),
via service-role introspection. **No resident or client record was
created, linked, or modified to produce this report.**

## Phase A — Real AxisCare client response shape

The previous `getClientSample()` discovery stub (`limit=1`, untyped
`clients: unknown`) has never had a real record's shape inspected. It now
has. Confirmed live fields on an AxisCare client record: `id` (integer),
`firstName`/`lastName`/`goesBy`, `status: { active: boolean, label:
string }`, `classes: [{ code, label }]`, `administrators`, `community: {
id, name } | null`, `region`, `personalEmail`/`billingEmail`,
`homePhone`/`mobilePhone`/`otherPhone`, `residentialAddress`/
`billingAddress`, `startDate`, `effectiveEndDate`, `createdDate`,
`conversionDate`, `externalId`, plus care-specific fields
(`allergies`, `advanceDirective`, `dnr`, `triageLevel`, etc., mostly
`null` in this sample). No `pg_catalog`-equivalent "last update
timestamp" field was observed on the client object itself.

## Phase B — Deterministic lifecycle mapping (implemented, code)

`lib/integrations/axiscare/clientLifecycle.ts` (6/6 tests):

| AxisCare state | Serve OS treatment |
|---|---|
| `status.active = true` | **Active Client** |
| `status.active = false`, class code `WAF Prospect` | **Prospect** |
| `status.active = false`, class code `WAF - Active No Visits` (AxisCare's own label: "WAF Signed Agreement / No Visits") | **Prospect** — signed on, not yet receiving service; this is a *pending*, not a *past*, relationship |
| `status.active = false`, no prospect class, has contact info AND a `startDate` | **Inactive Client** — real evidence service actually began |
| `status.active = false`, no prospect class, missing contact info or `startDate` | **Needs Review** — never assumed either way |
| No AxisCare link at all | **Watermere Resident**, not a client (unchanged from today) |

**"On Hold" and "Former Client" were not carried forward.** Neither
corresponds to any real AxisCare status/class value observed in this
sample, and no Serve-specific business definition for either was found
documented anywhere in the codebase — they were almost certainly an
earlier, undocumented, arbitrary mapping of AxisCare data (which is the
likely reason the counts Hud sees don't match AxisCare's real lists).
Retired rather than kept.

## Phase C — Identity reconciliation (implemented, code)

`lib/integrations/axiscare/clientIdentityMatching.ts` (11/11 tests) —
strict order: confirmed AxisCare ID link (none exist yet — no sync has
ever run) → exact normalized email → exact normalized phone → exact
name+apartment → exact name+community. A phone/email match whose name
disagrees is returned with `requiresReview: true`, never silently
accepted. Name-only matches are never returned as a match at all.

A short, explicit denylist (`isKnownNonResidentAxisCareClient`) excludes
AxisCare rows confirmed, by direct inspection, to be placeholder/internal
records, not people: **"Client Lead," "New Client," "Integration Test,"
"Micah Test," "Serve Office,"** and the community's own umbrella record
("Watermere at Frisco Community"). This is a short, reviewable list, not
a name-pattern heuristic — chosen deliberately so a real resident whose
name happens to contain a common word is never excluded by accident.

## Phase D — Full dry-run classification (25 real AxisCare clients)

| AxisCare ID | Name | Status | Class | Proposed resident | Match basis | Proposed lifecycle | Action |
|---|---|---|---|---|---|---|---|
| 1 | Client Lead | Inactive | — | — | — | Excluded | No action — placeholder record |
| 2 | Sarah Adams | Inactive | — | none found | — | Inactive Client | Needs review — real-looking record, unmatched |
| 3 | Watermere at Frisco Community | Active | Watermere Frisco | — | — | Excluded | No action — community's own record, not a person |
| 4 | Maryann Smith | Inactive | — | none found | — | Inactive Client | Needs review — unmatched |
| 5 | Diane Vento | Inactive | — | none found | — | Inactive Client | Needs review — unmatched |
| 6 | Jeremy Goldberg | Inactive | — | none found | — | Needs Review | Needs review — thin record (no contact info, no start date) |
| 7 | Linda Kaplan | **Active** | Watermere Frisco | none found | — | Active Client | **Needs review — active client, unmatched** |
| 8 | Hank Azeria | Inactive | — | none found | — | Needs Review | Needs review — thin record |
| 9 | Elliott Goldberg | **Active** | CINCH, Watermere Frisco | none found | — | Active Client | **Needs review — active client, unmatched** |
| 10 | Serve Office | Active | — | — | — | Excluded | No action — internal/admin record |
| 11 | Michelle (Mick) Helsley | **Active** | CINCH, Watermere Frisco | none found | — | Active Client | **Needs review — active client, unmatched** |
| 12 | Doris Kakazu | **Active** | CINCH, Watermere Frisco | none found | — | Active Client | **Needs review — active client, unmatched** |
| 13 | Kathryn (Kathy) Morshed | **Active** | CINCH, Watermere Frisco | none found | — | Active Client | **Needs review — active client, unmatched** |
| 14 | Integration Test | Inactive | CINCH | — | — | Excluded | No action — test record |
| 15 | Micah Test | Inactive | — | — | — | Excluded | No action — test record |
| 16 | John McKey | **Active** | CINCH, Watermere Frisco | none found | — | Active Client | **Needs review — active client, unmatched** |
| 17 | Cecilia Perry | Active | Watermere Frisco | Cecilia Perry | phone (names agree) | Active Client | Propose link (pending human confirmation) |
| 18 | New Client | Inactive | — | — | — | Excluded | No action — placeholder record |
| 19 | Adrian Reyes | Inactive | WAF - Active No Visits | Adrian Reyes | phone (names agree) | Prospect | Propose link |
| 20 | Delia Reyes | Inactive | WAF - Active No Visits | Delia Reyes | phone (names agree) | Prospect | Propose link |
| 21 | Wilma Pinion | Inactive | WAF - Active No Visits | Lynell Pinion | phone, **name mismatch** | Prospect | **Needs review — confirm whether "Wilma" and "Lynell" Pinion are the same person before linking** |
| 22 | Pamela Hatch | Inactive | WAF Prospect | Pamela Hatch | email (names agree) | Prospect | Propose link |
| 23 | Robert Hatch | Inactive | WAF Prospect | Pamela Hatch (same resident as #22) | phone, **name mismatch + duplicate target** | Prospect | **Needs review — Robert shares a phone with Pamela's resident record; determine whether he needs his own resident record** |
| 28 | Rubyetta Cain | Active | CINCH, Watermere Frisco | Rubyetta Cain | phone (names agree) | Active Client | Propose link |
| 29 | Brenda Fritschen | Active | CINCH, Watermere Frisco | Brenda Fritschen | phone (names agree) | Active Client | Propose link |

## Totals

- **Active clients (real):** 9 (11 observed with `status.active = true`, minus 2 excluded non-person records)
- **Inactive clients (real):** 5
- **Prospects:** 5
- **Confirmed matches (name-agreeing email/phone):** 6 — Cecilia Perry, Adrian Reyes, Delia Reyes, Pamela Hatch, Rubyetta Cain, Brenda Fritschen
- **Ambiguous matches (requires human review):** 2 — Wilma Pinion (→ possible Lynell Pinion), Robert Hatch (→ possible shared record with Pamela Hatch)
- **Unmatched records (no resident found at all):** 11, of which **5 are currently-Active AxisCare clients** (Linda Kaplan, Elliott Goldberg, Michelle Helsley, Doris Kakazu, Kathryn Morshed, John McKey — six, not five; see table) — the highest-priority review group, since these are real, currently-active AxisCare clients Serve OS has no linked resident record for at all
- **Duplicate resident candidates:** 1 pair (Pamela/Robert Hatch → same resident row)
- **Excluded (not real people):** 6

## What was implemented (non-destructive)

- `lib/integrations/axiscare/clientLifecycle.ts` + tests (Phase B, code).
- `lib/integrations/axiscare/clientIdentityMatching.ts` + tests (Phase C, code).
- `supabase/migrations/20260819000000_add_resident_axiscare_client_sync.sql` — extends `person_vendor_identity_links`/`person_documents`'s existing `subject_type` check constraint (currently `workforce_member`-only) to include `resident`, and adds `sync_axiscare_client_identity()`, a new function mirroring the already-in-production `sync_axiscare_vendor_identity()` exactly (same never-auto-confirm discipline) rather than changing that function's signature, since it already has a live production caller (`lib/workforce/axiscareCaregiverSync.ts`). **Not applied** to the live database.
- `lib/data/residentAxisCareLinks.ts` — thin TypeScript wrapper calling the new RPC, mirroring `lib/data/personVendorIdentityLinks.ts`'s existing pattern exactly.

## STOP — no bulk write performed

Per the mandatory pause: this report and the code above are the complete
deliverable for this phase. **No `person_vendor_identity_links` row was
inserted, no resident record was created or modified, and no AxisCare
data was written anywhere.** The 6 "Propose link" rows are only that —
proposals — pending Hud's review of this table before any sync script is
actually run against production.
