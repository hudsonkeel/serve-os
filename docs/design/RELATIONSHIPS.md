# Relationships — Conceptual Model

Status: phase 1 (foundation) + phase 2 (Daily Action Board, Operational
Whiteboard, Service Opportunity) + phase 3 (prospect consolidation) +
phase 4 (External Clients workspace and conversion lifecycle) implemented
— data model, three Relationships views (`/relationships/actions` Action
Board, `/relationships/whiteboard` Whiteboard, `/relationships` All
Relationships), a fourth top-level workspace (`/external-clients`),
`/relationships/[id]` detail page, resident linking, stage history,
touches, next actions with edit/audit, working notes, Relationship
Timeline, early nonclinical service-opportunity planning, full Resident
Prospect creation with duplicate prevention, and four explicit conversion
paths (Resident Prospect → Active Client; External Prospect → Active
External Client / New Resident Prospect / Existing Resident Prospect). No
Kanban, no drag-and-drop, no proposal/assessment workflow integration, no
notifications. See "Non-goals" and "Backlog" below.

> **A prospect is a Relationship type, not a Resident classification.**
> The Residents module has no "Serve Prospect" concept — see "Prospect
> status belongs exclusively to Relationships" below.

> **External Clients is the durable workspace for prospective, active,
> paused, and former clients outside supported communities.**

> **External Prospects are one lifecycle view inside External Clients,
> not a standalone CRM or sidebar workspace.** They are still
> `relationships` rows (`relationship_type = 'external_prospect'`) —
> External Clients reuses the Relationship infrastructure end to end
> rather than forking a second CRM. See "External Clients" below.

> **Conversion preserves the existing Relationship and all of its
> history.** Every conversion path below updates the same
> `relationships.id` in place — stage history, touches, actions, Working
> Notes, Service Opportunity, and Timeline all carry forward. No
> conversion path ever creates a disconnected replacement Relationship.

> **A Serve client may be a community Resident or an External Client.**
> Both are represented the same way at the Relationship layer
> (`relationship_type = 'active_client'`); a Resident-linked one has
> `resident_id` set and appears in Relationships, an External one has a
> linked `external_clients` row and appears in External Clients. See
> "External Clients" and "Conversion architecture" below.

## The core distinction

**Resident** — identity. Who this person is: name, unit, imported source
data, care details. May originate from an Accushield CSV import, manual
entry, website intake, an assessment, community-provided data, or a
future Cinch/AxisCare sync. **A resident may exist with zero Serve
sales/service engagement** — most imported Watermere residents have none,
and this phase never creates a Relationship for them automatically.

**Relationship** — engagement. Serve's active relationship with a person,
family, organization, or referral source. Answers: who are we engaging
with, what kind of opportunity is this, where are we in the process, who
owns it, what happened most recently, what has to happen next, and when
is that due. **A Relationship may exist with no resident at all** — an
external prospect who contacted Serve before any resident record exists —
and may later be linked to a resident (existing or newly created)
**without losing any of its history**. `relationships.resident_id` is
nullable specifically to make this possible; nothing in this schema
requires a resident to exist first.

## Prospect status belongs exclusively to Relationships

Every Watermere resident is inherently a *possible* future Serve client
simply because Serve operates within the community — that alone is not a
meaningful operational distinction, and a resident-level "Serve Prospect"
classification only invited two competing prospect systems to drift out of
sync. As of the prospect-consolidation phase, it no longer exists:

- The Residents module has no Serve Prospects tab, no SERVE PROSPECT
  badge, and no prospect-driven counts or filters. A resident with no
  Relationship simply shows their legitimate resident/client information —
  never a placeholder like "No Relationship" or "Not a Prospect."
- A resident with one or more active (non-closed) Relationships shows a
  concise, read-only summary on their directory row and detail page (stage,
  next action, due date, "Open Relationship") — derived fresh from
  `relationships` on every load via `getActiveRelationshipSummariesByResident()`
  (`lib/data/relationships.ts`, one bulk query, never one query per
  resident), never duplicated onto the resident record.
- `collapseLegacyProspectStatus()` (`lib/residents/search.ts`) is the one
  choke point that guarantees a resident's derived `serveRelationshipStatus`
  can never be `'prospect'`, regardless of which of the two legacy sources
  (see "Legacy classification and its actual source" below) produced it.
  Active Client / On Hold / Former Client / Wellness Watch are untouched —
  only the prospect value collapses to `'none'`.
- Do not infer a Resident Prospect Relationship merely because a resident
  lives at Watermere, isn't an Active Client, was recently imported, or has
  incomplete contact information. A Relationship represents an intentional,
  active engagement — see "Resident Prospect creation" below for the only
  two ways one comes into existence.

### Legacy classification and its actual source

`residents.serve_relationship_status` — the column the original prospect
classification was designed around
(`20260702000000_add_resident_serve_relationship_status.sql`) — **does not
exist in the live database.** That migration was never applied (confirmed
by direct schema inspection). Every "Serve Prospect" resident visible
before this phase was produced entirely by a *different* mechanism: staged
`resident_relationship_imports` rows (`is_prospect` / `serve_relationship_status`
columns), re-matched to a resident at read time by
`stagedServeRelationshipStatus()` and merged with (given priority over) the
resident's own field in `mapResidentToRecord()`. See
`docs/maintenance/LEGACY_RESIDENT_PROSPECT_REVIEW.md` for the full audit of
which residents this affected and why none warranted an automatic
Relationship.

Neither the dormant migration nor the raw staged import data was touched
by this phase — `resident_relationship_imports` is historical provenance
(what the source system said at import time) and rewriting it would
destroy that record. The fix lives entirely in the derivation/display
layer, which is both simpler and equally durable: there is no live column
value to migrate, and the one collapse function guarantees the UI can
never surface `'prospect'` again regardless of what any future import
process stages.

### Resident Prospect creation

Two entry points, both funneling through the same `createRelationship()`
server action with `relationshipType: "resident_prospect"`:

1. **From Relationships** — "+ Add Resident Prospect"
   (`components/relationships/AddResidentProspectForm.tsx`): search and
   select an existing resident (reuses the same picker as "Link Existing
   Resident" — `searchResidentsForLinking()`), then capture stage, owner,
   source, primary contact, optional summary/Working Note/Service
   Opportunity, and an optional first Next Action.
2. **From a resident's own page** — "Start Relationship"
   (`components/residents/StartRelationshipCard.tsx`): the same creation
   flow, with the resident preselected and primary contact pre-filled from
   Family Contacts.

Both check for an existing active Resident Prospect Relationship *before*
showing the creation form (see "Duplicate prevention" below) — a duplicate
is never created silently.

### Duplicate prevention

`lib/relationships/duplicateDetection.ts#findActiveResidentProspect()` —
pure, unit-tested: one resident may have at most one *active* (status
`active` or `on_hold` — not `closed`) `resident_prospect` Relationship by
default. This is a UX rule enforced in the server actions that create
Relationships, not a hard database uniqueness constraint — a closed
historical Relationship never blocks a legitimate new one (e.g.
reactivating after a `closed_lost` outcome), and "Create Another
Relationship" remains available as an explicit, confirmed override from
the duplicate-warning step.

When a duplicate is detected, both entry points show the existing
Relationship's name and stage with "Open Relationship" as the default
action — never a silent no-op, never a silent second Relationship.

| Type | Meaning |
|---|---|
| `resident_prospect` | A sales/service opportunity connected to an existing resident record |
| `external_prospect` | A prospective customer or family inquiry not yet connected to a resident, managed via External Clients → Prospects |
| `active_client` | An active Serve customer relationship — either resident-linked (`resident_id` set, appears in Relationships) or external (a linked `external_clients` row, appears in External Clients) |
| `former_client` | Reserved; unused by any conversion path today — see "Former external clients" below for how that lifecycle is actually represented |
| `referral_source` | A person or organization that refers prospective customers |
| `community_partner` | A senior-living community or related organizational relationship |
| `professional_contact` | A physician, hospital contact, social worker, care manager, etc. |
| `other` | Anything not covered above |

Phase 1's UI and pipeline logic are built around `resident_prospect` and
`external_prospect` — the other six types are fully representable (they
can be created, staged, searched, and filtered) but don't get
sales-pipeline-specific treatment like the workspace's attention-status
derivation.

## External Clients

`/external-clients` is a fourth top-level workspace (immediately below
Relationships in the sidebar), not a second CRM. It is four lifecycle
*views* over the same `relationships` rows Relationships itself reads —
see "Reuse existing Relationship infrastructure" below.

| View | Relationship_type | Selector |
|---|---|---|
| Prospects | `external_prospect` | `status != 'closed'` |
| Active Clients | `active_client` | linked `external_clients.status = 'active'` |
| On Hold | `active_client` | linked `external_clients.status = 'on_hold'` |
| Former Clients | `active_client` | linked `external_clients.status = 'former'` |

`lib/externalClients/search.ts#isExternalWorkspaceRow()` is the one
predicate that decides whether a Relationship row belongs in External
Clients at all: `relationship_type === 'external_prospect'`, or
(`relationship_type === 'active_client'` and `resident_id` is null). A
resident-linked `active_client` Relationship (from a Resident Prospect
conversion) never appears here — see "Relationships workspace scope"
below for the mirror-image rule.

### The `external_clients` table

One row per Relationship (`external_clients.relationship_id`, unique),
created only by `convert_external_prospect_to_active_client()` — never a
standalone entity a user can create directly. Carries exactly the
traditional-home-care-specific fields a Relationship has no reason to
carry: name, service address, primary contact, service start/end date,
former-reason, and a lifecycle `status` (`active` / `on_hold` / `former`)
that is **independent of `relationships.status`** — a Relationship stays
`status = 'active'` for the entire life of an external client engagement
(it is never "closed" just because the client is temporarily on hold or
has become former; see "Stage/status semantics" below). Everything else —
stage, owner, next action, touches, Working Notes, Service Opportunity,
Timeline — stays on the linked `relationships` row and is reused as-is.

### Reuse existing Relationship infrastructure

`/external-clients` intentionally has no independent write path.
`getExternalClientWorkspaceRows()` (`lib/data/externalClients.ts`) calls
the same `getRelationshipBoardRows()` the Action Board and Whiteboard use
(nearest action, active note, Service Opportunity, attention status — all
computed identically), narrows to the rows `isExternalWorkspaceRow()`
selects, and merges in each row's `external_clients` fields where present.
`/relationships/[id]` remains the one detail page for every Relationship
type, including externals — External Clients links into it rather than
building a parallel detail page; `ExternalClientPanel.tsx` (address,
service dates, lifecycle actions) and `ConvertRelationshipPanel.tsx`
(conversion entry points) render there conditionally.

### Former external clients

Marking a client Former sets `external_clients.status = 'former'` and
`service_end_date` — it does not close, delete, or replace the underlying
Relationship. **Reactivating a Former (or On Hold) client reuses the same
ongoing Relationship** (`reactivate_external_client()` flips
`external_clients.status` back to `active`) rather than creating a new
one — chosen because nothing about this scope's architecture requires a
distinct second engagement for a returning client, and reusing the
Relationship preserves its full stage/touch/action/Timeline history
across the gap, which a brand-new Relationship would discard. If a future
scope finds a real reason two truly separate engagements are needed
(e.g. a materially different service arrangement), that would be a new,
explicit decision — not an accidental default.

## Conversion architecture

Four explicit, user-triggered conversion actions — never automatic, never
inferred from a stage change alone:

```
Resident Prospect ──────────────────► Active Client (resident-linked)
                                        (Part 12)

External Prospect ──┬──► Active External Client
                     │     (Part 14 — creates external_clients row)
                     │
                     ├──► New Resident Prospect
                     │     (Part 15 — creates a Resident, relinks)
                     │
                     └──► Existing Resident Prospect
                           (Part 16 — links to a Resident, relinks)
```

Every path is one atomic `plpgsql` RPC
(`supabase/migrations/20260719000000_create_external_clients_and_conversions.sql`)
that re-validates the Relationship's current `relationship_type` under a
row lock before doing anything — the same guard that makes a second
conversion attempt fail cleanly (`RELATIONSHIP_NOT_ELIGIBLE`) once the
first has already changed the type, rather than needing a separate
uniqueness constraint (Part 21: "conversion of an already converted
Relationship" is rejected by construction, not by a special case).

**The Relationship's own id, stage history, touches, actions, Working
Notes, Service Opportunity, and Timeline are never recreated or
disconnected by any conversion** — every RPC above only ever `update`s
the existing `relationships` row (type, and sometimes `resident_id`) and
inserts new dependent rows (a stage-history entry, a Timeline event, a
`relationship_conversions` audit row, and — for two of the four paths —
an `external_clients` or `residents` row).

### Open sales actions

Part 12/14/17 each accept an open-action disposition
(`resolve_relationship_open_actions()`, shared): `complete`, `dismiss`, or
`keep_open` (the default) — applied as one blanket choice to every
currently-open `relationship_actions` row at the moment of conversion or
Mark-Former. `keep_open` is a deliberate no-op, not an omission: a
conversion must never silently resolve open work the user didn't
explicitly ask to close out.

### Onboarding action

Three of the four conversion forms (everywhere a new service relationship
begins) offer an optional first onboarding action, created via the same
`create_relationship_action()` RPC every other Next Action uses — not a
new creation path.

### Active Client status is derived, not duplicated

Part 12 requires a converted resident to become an "Active Serve Client."
There is no persisted, writable `residents` column for this (see "Legacy
classification and its actual source" above — the one migration that
would add a resident-level status column was never applied, and this
scope does not revive it). Instead, `mapResidentToRecord()`
(`lib/data/communityMetrics.ts`) treats **any resident with a linked
`active_client`-type Relationship** (from
`getActiveRelationshipSummariesByResident()`, already fetched for the
Relationship-summary work in phase 3) as an Active Serve Client,
overriding whatever staged import data says. This is the same principle
phase 3 established for prospect status — Relationship-derived, computed
fresh on every load, never written to a resident column that could drift
out of sync with what actually happened.

### Conversion audit

`relationship_conversions` — append-only, one row per completed
conversion (`relationship_id`, `from_relationship_type`,
`to_relationship_type`, `conversion_path`, `resident_id`/
`external_client_id`, `effective_date`, `conversion_note`, `converted_by`,
`converted_at`). Never written on a cancelled or failed attempt — every
insert lives in the same transaction as the conversion it records.
Reachable through `relationship_id` for test-data cleanup, the same
one-root-marker principle `docs/engineering/TEST_DATA_HYGIENE.md`
establishes for every other Relationship-dependent table.

### Workspace movement after conversion

- **External Prospect → Active External Client**: leaves External
  Clients → Prospects, enters External Clients → Active Clients. Never
  appears in Relationships' default view (see "Relationships workspace
  scope" below). Never creates a Resident.
- **External Prospect → New/Existing Resident Prospect**: leaves External
  Clients entirely (relationship_type is no longer `external_prospect`),
  appears in Relationships as a Resident Prospect. Does **not**
  automatically become an Active Client — that remains Part 12's separate,
  explicit action.
- **Resident Prospect → Active Client**: stays in Relationships (now
  filtered under "Active Clients" rather than "Resident Prospects"); the
  linked resident's derived status becomes Active Serve Client
  everywhere it's shown (Residents directory, resident detail page).

Every mutation above calls `router.refresh()` after its server action
resolves — the same router-refresh-safe pattern every other write in this
subsystem already uses; no conversion leaves stale client-side state
behind.

## Stage

Where a Relationship currently stands (`relationships.stage`, type
`PipelineStage` in `lib/supabase/types.ts` — named that, not
`RelationshipStage`, because that name was already taken by
`resident_relationship_profiles.relationship_stage`, an unrelated
personal-closeness scale used by Getting to Know).

`new_inquiry → contact_attempted → connected → discovery →
assessment_scheduled → assessment_completed → proposal_in_progress →
proposal_sent → considering → follow_up_needed → ready_to_start → won |
on_hold | closed_lost`

A stage answers "where does this stand right now" — it is not a log of
every action taken (that's Touches and Timeline) and is deliberately not
more granular than this list. `status` (`active` / `on_hold` / `closed`)
is a separate, coarser field derived automatically from stage changes
(`on_hold` → `on_hold`; anything else, including `won`, → `active`) — see
`change_relationship_stage()` in
`20260719000000_create_external_clients_and_conversions.sql`.

**`won` is not a terminal status** (fixed in phase 4 — see "Stage/status
semantics" below). Only `closed_lost` — an actual sales outcome that ends
the relationship — sets `status = 'closed'`. Before phase 4,
`change_relationship_stage()` treated `won` the same as `closed_lost`,
which meant a converted Active Client would have disappeared from every
ongoing operational view (Action Board, Whiteboard, attention counts) the
moment it reached `won`. Every one of the four conversion RPCs sets
`stage = 'won'` and `status = 'active'` explicitly for exactly this
reason — a `won`/Active Client relationship must stay visible as ongoing
work, not read as finished.

## Touch

A meaningful, human-initiated interaction — "what happened?" (calls,
emails, texts, meetings, assessments, resident visits, proposals). Logging
a touch atomically advances `relationships.last_meaningful_touch_at`
(never backward) and writes exactly one Timeline event.
`resident_touches` (the resident-scoped equivalent from the Connections/
Getting to Know phase) was **not** reused or extended — it has no write
path anywhere in the app today and can't represent a Relationship with no
resident. `relationship_touches` is the real, actively-written version of
that same idea.

## Next Action

Accountable, owned, future work — the thing that must happen next, and
when. Directly modeled on the editable-wellness-follow-up architecture
(`resident_wellness_follow_ups`, `20260716050000_add_wellness_follow_up_editing.sql`):
create, edit in place, complete, or dismiss; edits are diffed
field-by-field into `relationship_action_edits` (one audit row per
changed field, none for a no-op save) and summarized into one Timeline
event per save. A newly-chosen past due date is rejected; an unchanged
one that has simply passed since creation is not re-validated.

## Working Note

Temporary context or thinking relevant to moving a Relationship forward —
"family is discussing options this weekend," not a task and not
permanent history. Same lifecycle as Resident Working Notes (open →
resolved/archived, append-only, no delete), in its own
`relationship_working_notes` table rather than a nullable-resident
version of `resident_working_notes` — making `resident_id` optional on
that table would let a note exist with neither a resident nor a
relationship, weakening an invariant Resident Memory already relies on.
When a Relationship is later linked to a resident, its working notes
**stay Relationship records** — they are never copied or moved into
`resident_working_notes`.

## Relationship Timeline

Permanent, chronological, append-only history of a Relationship —
`relationship_timeline`, deliberately separate from `resident_timeline`
(an external prospect may have no `resident_id` to attach a resident-
timeline event to). Automatically logged: relationship created, resident
linked, stage changed (including the three "notable" stage transitions —
won, on_hold, closed_lost — which each get their own more specific event
type), touch logged, action created/updated/completed/dismissed, working
note created/resolved. Nothing is ever inserted ad hoc from application
code outside the RPCs in `supabase/migrations/20260717*.sql` — every
Timeline row is written in the same transaction as the change it
describes.

**Not cross-linked into Resident Timeline in this phase.** A linked
Relationship's activity (stage changes, touches, actions) is visible on
`/relationships/[id]` but does not appear on the resident's own page. See
"Future cross-linking question" below.

## Ownership and staff identity

`owner_label` (on `relationships`) and `assigned_to` (on
`relationship_actions`) are `text`, not a `uuid` foreign key to a staff
table — because there is no uuid staff identifier anywhere in this
codebase to reference. `user_profiles` is keyed by email and exposes no
id; the one prior attempt at a uuid owner column
(`resident_relationship_profiles.relationship_owner_user_id`, from the
Connections/Getting-to-Know phase) was left deliberately unconstrained
with a comment explaining exactly this. Every actor field in this
migration set (`created_by`, `updated_by`, `changed_by`, `edited_by`,
`closed_by`, etc.) is `text`, populated from
`getCurrentAuthorizedUser()`'s email/full_name — the same convention as
every other table in this app.

## Community/organization

`community_name` and `organization_name` are plain denormalized `text`
fields, matching `residents.community_name`/`community_code` exactly —
there is no `communities` or `organizations` table anywhere in this
codebase (confirmed by exhaustive grep across `serve-os`, `serve-website`,
and `serve-intake-mvp`) to foreign-key against.

## The `prospects` table

`prospects` (website/intake care-seeker inquiries, populated by
`serve-website`'s Netlify function) predates this repo's tracked
migration history — there is no DDL for it here, only the TS type in
`lib/supabase/types.ts`. It has no owner, no next-action, and no stage
concept beyond a linear status (`new → reviewing → contacted →
assessment_scheduled → converted → closed`). This phase does not modify,
rename, or replace it. `relationships.prospect_id` is an optional
provenance link (nullable, `on delete set null`) for when an
`external_prospect` Relationship originated from a `prospects` row — it
is never required, and no code path here writes to `prospects`.

## Why not a generic editable whiteboard table

Every Relationship is a structured record with its own persisted stage,
owner, touches, actions, and Timeline — not a free-form spreadsheet row.
**The operational board is a view over Relationship data, not an
independent source of truth.** A future Kanban/pipeline board, an
action-list view, and Brian's eventual whiteboard/table configuration are
all expected to read and write the same `relationships` /
`relationship_actions` / `relationship_touches` records this phase
establishes — none of them get their own storage.

## Daily attention logic

Computed fresh on every page load in `lib/relationships/attention.ts` —
never stored, the same principle as `getWellnessWatchSummaryByResident()`
(a flag that can go stale the instant it's written is worse than no flag
at all). Seven states: `overdue`, `due_today`, `due_this_week`,
`upcoming`, `no_next_action`, `on_hold`, `closed`. `on_hold`/`closed`
always win regardless of due date. `no_next_action` only applies to
`resident_prospect`/`external_prospect` types with no open action — a
`referral_source` or `active_client` with no open action is just
`upcoming`, not flagged as missing something.

**Timezone**: day-precision boundaries (overdue vs. due today vs. due
this week) use `getCentralDayBoundaryUtc()` — this app's one established
Central-time day-boundary helper, already used identically by
`getWellnessFollowUpDashboardCounts()`. "Due this week" is the 7-day
window starting tomorrow (Central), matching that function's bucket
exactly, not an ISO calendar week.

## Relationships workspace scope (phase 4 addition)

`/relationships`'s default view **excludes** External Prospects and
external Active Clients — the mirror image of `isExternalWorkspaceRow()`
above — so the two workspaces don't show overlapping rows for the same
underlying data. This is the "Preferred" option from the scope that
introduced External Clients (excludes by default, retains access when
needed), not the "include everything in one All Relationship Records
view" alternative:

- `RelationshipsWorkspace.tsx` filters `rows` down to non-external ones
  before any other filter/search/attention-count runs.
- An "Include External Client records" checkbox (unchecked by default)
  restores them into every filter/search/count on the page — the
  "advanced filter" access Part 9 requires.
- `/relationships/[id]` always works for any Relationship regardless of
  this toggle — the exclusion only affects the workspace *list*, never
  direct detail access.
- Resident-linked `active_client` Relationships (from Resident Prospect
  conversions) are never excluded — they belong in Relationships by
  definition (Part 9: "resident-linked active_client" is explicitly one
  of the types Relationships owns).

## View architecture (Part 2 addition)

Three views share one data model — none has its own storage, matching "Why
not a generic editable whiteboard table" above:

- **Action Board** (`/relationships/actions`) — "what needs attention
  today." Relationships bucketed into Overdue / Due Today / Due This Week /
  No Next Action / Waiting-On Hold, plus a Recently Completed strip. The
  default landing surface for daily work.
- **Whiteboard** (`/relationships/whiteboard`) — "where does everything
  stand." One row per Relationship, every column at a glance, inline
  editing via an expandable panel per row.
- **All Relationships** (`/relationships`) — the original phase-1 workspace
  table: search, type/status tabs, unfiltered by attention state. Kept as
  its own route (not folded into Whiteboard) because it was already linked
  from the sidebar and multiple entry points before this phase; nothing
  that pointed at `/relationships` needed to change.

All three render `RelationshipViewTabs` so the current view and the other
two are always one click away. `/relationships` deliberately stayed the
"All Relationships" route rather than becoming the Action Board's home, to
avoid silently changing what every existing link to `/relationships`
lands on.

## Multiple open actions and the primary-action rule (Part 2 addition)

A Relationship can have more than one open action (the detail page's "+ Add
Another Action"). Exactly one is "the" Next Action shown on the
workspace/board/whiteboard and used for attention derivation; the rest stay
visible only on the detail page. `lib/relationships/sorting.ts#selectPrimaryOpenAction`
picks it, pure and unit-tested: soonest due date wins (an action with no
due date sorts after any that has one, however far out — ascending due-date
sort alone already gives overdue actions precedence over future ones, since
overdue is chronologically earlier) → highest priority → oldest creation
date. `lib/data/relationships.ts#getNearestOpenActionByRelationship()`
fetches every open action per relationship and reduces with this function,
rather than trusting incidental Postgres row order.

**On-hold and closed relationships suppress action alerts entirely** —
`getRelationshipAttentionStatus()` returns `on_hold`/`closed` immediately
regardless of any open action's due date (this was already true in phase
1; phase 2 just adds explicit tests and this note). A stale, uncompleted
action left on a closed or on-hold Relationship is not surfaced as an
error condition anywhere — it's simply invisible to the Action Board's
attention buckets, visible only if someone opens that Relationship
directly. This was a deliberate choice, not an oversight: an on-hold or
closed Relationship's due dates are no longer meaningful, and flagging
them as a "data integrity warning" would create alert noise for a
condition staff can't act on (the Relationship is paused/done on purpose).

## Sorting (Part 2 addition)

`lib/relationships/sorting.ts` — pure, unit-tested, deterministic (every
comparator has a final tie-breaker so two rows are never left in
unspecified order):

- **Action Board** (`sortActionBoardRows`): attention severity → due date →
  priority → oldest last-meaningful-touch (never-touched sorts oldest of
  all) → Relationship name.
- **Whiteboard** (`sortWhiteboardRows`): attention severity → due date →
  priority → most-recently-updated → Relationship name.

## Daily Action Board (Part 2 addition)

`/relationships/actions` — the primary daily-work surface. Sections:
Overdue, Due Today, Due This Week, No Next Action, Waiting / On Hold, and
a separate Recently Completed strip (actions completed in the last 7 days;
dismissed actions are excluded — a dismissal isn't a completion). Empty
sections are hidden entirely rather than rendered as empty panels; a
unified `EmptyState` covers the fully-empty case.

Each card offers Complete / Edit / Dismiss / Log Touch / Open Relationship
(No Next Action cards get Add Next Action / Log Touch / Open Relationship
instead — there's nothing to complete or dismiss). Completing an action
shows an inline "What happens next?" prompt (Add Next Action / No
Follow-up Needed / Open Relationship) in place, before the page refreshes —
this is local UI state on that one card, not a separate persisted flag.
Every mutation goes through the same server actions the detail page uses
(`completeNextAction`, `editNextAction`, `dismissNextAction`,
`createNextAction`, `logRelationshipTouch`) — the board is a view, not an
alternate write path.

## Operational Whiteboard (Part 2 addition)

`/relationships/whiteboard` — one row per Relationship: Relationship,
Prospect/Resident, Type, Stage, Last Touch, Next Action, Due, Owner,
Priority, Service Opportunity, Active Note, Attention. The "Prospect /
Resident" column never mislabels a primary contact (often an adult child)
as the resident — `lib/relationships/search.ts#getProspectOrResidentLabel()`
prefers the linked resident, then a named prospective resident, then falls
back to the primary contact explicitly prefixed "Contact: ", and returns
nothing rather than guessing when none of those exist.

Editing happens through an expandable panel per row (this codebase has no
modal/dialog component anywhere — see the same convention used throughout
Resident Memory), never inline-contenteditable table cells. The panel
covers Stage, Owner/Priority, Next Action, Log Touch, Working Note, and
Service Opportunity — every one of them calls the same controlled server
action/RPC the detail page or Action Board would, so stage history, action
audit, touch records, and Timeline generation are never bypassed.

**Owner/Priority editing required a new RPC** —
`update_relationship_owner_and_priority()`
(`20260718010000_create_relationship_service_opportunities.sql`) — because
no existing write path touched those two fields after creation. It follows
`upsert_relationship_service_opportunity()`'s lighter audit pattern (one
Timeline event summarizing what changed, no field-level diff table) rather
than `relationship_action_edits`' full audit machinery, since owner/
priority are simple single-value housekeeping fields, not accountable
next-step history.

## Filters (Part 2 addition)

Shared across Action Board and Whiteboard (`lib/relationships/boardFilters.ts`):
Type, Stage, Owner, Community, Priority, Resident-linked vs. External,
Status. **"Mine" is deliberately not implemented** — `owner_label` is free
text with no autocomplete or validation against a real staff list (see
"Ownership and staff identity" above), so comparing it against the current
actor's `full_name`/`email` would silently miss anyone who typed their own
name differently ("Brian" vs. "Brian Smith" vs. an email address). Per
Part 13's own instruction, an unreliable filter that quietly hides
relevant work was judged worse than no filter at all.

## Service Opportunity (Part 2 addition)

Early, nonclinical service-planning information for a prospect-oriented
Relationship — `relationship_service_opportunities`
(`20260718010000_create_relationship_service_opportunities.sql`): service
summary, visits/week (0-21), preferred days/time windows (free text —
there's no scheduling grid to validate against), estimated visit duration
(1-1440 minutes), anticipated start date, location/context, and a coarse
status (`draft` / `ready_for_proposal` / `superseded`). One row per
Relationship, edited in place via `upsert_relationship_service_opportunity()`
— no-op-safe, one Timeline event per meaningful save, no field-level audit
table (this is preliminary, frequently-revised context, not accountable
history the way a Next Action is).

**Explicitly not a care plan.** No clinical fields exist or are planned
here. **Explicitly not a schedule** — nothing here writes to AxisCare or
creates a Cinch visit; "visits per week" and "preferred days" are rough
planning inputs a human reads, not a machine-executable schedule. See
"Conversion from prospect to active client" in Backlog for the open
question of what (if anything) eventually reads this table to seed a real
schedule.

## Test data policy (Part 2 addition)

Any future live-database verification for this subsystem must follow
`docs/engineering/TEST_DATA_HYGIENE.md` — every synthetic root
`relationships` row must carry a `test_marker` value (added in
`20260718000000_add_relationship_test_marker.sql`, threaded through
`create_relationship()`'s optional `p_test_marker` parameter, never
exposed in the application UI or set by `lib/actions/relationships.ts`),
and cleanup runs through `scripts/cleanup-test-data.ts` — never an
app-facing delete control, never by weakening RLS. See that doc's "Known
Doris Kakazu cleanup" section for the historical record of what phase-1
verification left behind and how it was removed.

## Files

**Migrations**: `20260717000000_create_relationships_core.sql`
(`relationships`, `relationship_stage_history`, `relationship_timeline`,
`create_relationship`/`change_relationship_stage`/
`link_relationship_to_resident`), `20260717010000_create_relationship_touches.sql`,
`20260717020000_create_relationship_actions.sql`,
`20260717030000_create_relationship_working_notes.sql`,
`20260718000000_add_relationship_test_marker.sql` (`test_marker` column +
`create_relationship()`'s optional `p_test_marker` param),
`20260718010000_create_relationship_service_opportunities.sql`
(`relationship_service_opportunities`,
`upsert_relationship_service_opportunity()`,
`update_relationship_owner_and_priority()`, and the `relationship_updated`/
`service_opportunity_updated` Timeline event types).

**Pure logic**: `lib/relationships/constants.ts` (controlled values +
labels), `lib/relationships/validation.ts`, `lib/relationships/attention.ts`,
`lib/relationships/search.ts`, `lib/relationships/sorting.ts` (primary-
action selection, Action Board/Whiteboard row ordering),
`lib/relationships/boardFilters.ts` (shared filter model),
`lib/relationships/duplicateDetection.ts` (Resident Prospect duplicate
rule) — all independently unit tested (`lib/relationships/__tests__/*.test.ts`).
`lib/residents/search.ts#collapseLegacyProspectStatus()` (the prospect-
consolidation choke point — lives here, not in `lib/relationships/`,
because it operates on `ServeRelationshipStatus`, a Resident-side concept).

**Data/actions**: `lib/data/relationships.ts` (includes
`getRelationshipBoardRows()`, the one shared assembler both new views read
from — see "Performance" in the original Part 1 scope: avoid one query per
Relationship, avoid duplicate queries between the two pages;
`getActiveRelationshipSummariesByResident()` and
`getActiveProspectRelationshipCount()` for the prospect-consolidation
phase), `lib/actions/relationships.ts` (includes
`checkForActiveResidentProspect()`, the duplicate-check server action both
creation entry points call before showing their form).

**UI**: `app/relationships/page.tsx` + `components/relationships/RelationshipsWorkspace.tsx`
(table, filters, attention counts, search — hides zero-result states the
same way the Residents search page does), `AddExternalProspectForm.tsx`,
`AddResidentProspectForm.tsx` (search-select-resident → duplicate-check →
create); `app/relationships/[id]/page.tsx` + `RelationshipOverview.tsx`
(stage change, resident linking), `RelationshipActionsList.tsx`,
`RelationshipWorkingNotesSection.tsx`, `RelationshipTouchesSection.tsx`,
`RelationshipTimelineSection.tsx`; `components/residents/StartRelationshipCard.tsx`
(the resident-page entry point, now duplicate-aware — shows "Open
Relationship" instead of the creation form when one already exists),
`components/residents/ResidentRow.tsx` (the Relationship summary on
directory rows); `RelationshipViewTabs.tsx` (shared view switcher);
`app/relationships/actions/page.tsx` + `ActionBoard.tsx` (Daily Action
Board); `app/relationships/whiteboard/page.tsx` + `Whiteboard.tsx`
(Operational Whiteboard); `RelationshipFilterBar.tsx` (shared filter UI);
`RelationshipQuickForms.tsx` (the compact inline forms — stage, owner/
priority, action, touch, working note, service opportunity — shared by
both the Action Board and the Whiteboard so neither duplicates the other's
edit logic).

**Maintenance**: `docs/maintenance/LEGACY_RESIDENT_PROSPECT_REVIEW.md` —
the one-time audit of every resident the legacy Serve Prospect
classification affected.

**Phase 4 (External Clients + conversion lifecycle)**

**Migrations**: `20260719000000_create_external_clients_and_conversions.sql`
— `external_clients`, `relationship_conversions`; the four conversion RPCs
(`convert_resident_prospect_to_active_client`,
`convert_external_prospect_to_active_client`,
`convert_external_prospect_to_new_resident`,
`convert_external_prospect_to_existing_resident`); the three External
Client lifecycle RPCs (`place_external_client_on_hold`,
`reactivate_external_client`, `mark_external_client_former`); the shared
`resolve_relationship_open_actions()` helper; the `won`-is-not-terminal
fix to `change_relationship_stage()`; the `relationship_converted`/
`external_client_status_changed` Relationship Timeline event types; the
`relationship_conversion` Resident Timeline event type.

**Pure logic**: `lib/externalClients/constants.ts` (statuses, open-action
disposition labels), `lib/externalClients/search.ts`
(`isExternalWorkspaceRow()`, tab filtering, search — mirrors
`lib/relationships/search.ts`), `lib/externalClients/validation.ts`
(required-name, required-service-address validation) — all independently
unit tested (`lib/externalClients/__tests__/*.test.ts`).

**Data/actions**: `lib/data/externalClients.ts` (`getExternalClientWorkspaceRows()`
— reuses `getRelationshipBoardRows()`, never a second query path; the
four conversion wrappers; the three lifecycle wrappers),
`lib/actions/externalClients.ts` (server actions + validation for all of
the above), `lib/actions/relationships.ts#convertResidentProspectToActiveClient()`
(Part 12 stays in the Relationships action module — no `external_clients`
row involved).

**UI**: `app/external-clients/page.tsx` +
`components/externalClients/ExternalClientsWorkspace.tsx` (four tabs,
search, "+ Add External Prospect" — reuses `AddExternalProspectForm.tsx`
unchanged); `components/relationships/ConvertRelationshipPanel.tsx`
(all four conversion forms, rendered on `/relationships/[id]`);
`components/relationships/ExternalClientPanel.tsx` (address/service-date
display + On Hold / Reactivate / Mark Former actions, rendered on
`/relationships/[id]` in place of `ConvertRelationshipPanel` once an
external client exists); `components/Sidebar.tsx` (External Clients nav
item, immediately below Relationships); `components/relationships/RelationshipsWorkspace.tsx`
("+ Add Relationship" chooser replacing the two separate Add buttons; the
Include-External-Client-records toggle).

## Non-goals of this phase

Full Kanban pipeline, drag-and-drop stages, further whiteboard/table
customization beyond the Part 2 column set, proposal builder, assessment
automation, email sending, Gmail integration, call-system integration, SMS
integration, calendar integration, recurring tasks, external
notifications, Resident Intelligence, Cinch/AxisCare synchronization,
resident deduplication or merging, organization CRM depth, referral
commission tracking, sales forecasting, revenue projections, Constitution
amendments. (Phase 1 also listed "Brian's whiteboard/table customization"
and a "Kanban pipeline" as non-goals; the Whiteboard itself is now built —
see "Operational Whiteboard" above — but Kanban/drag-and-drop and further
per-user column customization remain out of scope.)

## Backlog

- **Kanban pipeline** — a drag-and-drop stage board, reading/writing the
  same `relationships` records the Whiteboard already reads/writes.
- **Whiteboard column/view customization** — the Part 2 Whiteboard has one
  fixed column set for everyone; per-user customizable views remain
  future work.
- **Proposal workflow integration** — `prepare_proposal`/`send_proposal`
  action types exist; no proposal document generation exists.
- **Assessment workflow integration** — `schedule_assessment`/
  `complete_assessment` action types and the `assessment_scheduled`/
  `assessment_completed` stages exist; no assessment tooling is wired to
  them.
- **Email/call ingestion** — touches are entirely manually logged today.
- **Staff directory and assignment normalization** — `owner_label`/
  `assigned_to` are free text with no autocomplete or validation against
  a real staff list, because no staff-identity table with a stable id
  exists yet (see "Ownership and staff identity" above). This is also why
  Part 2's Action Board/Whiteboard have no "Mine" quick filter — it would
  require exact-matching free text against the current actor's name, which
  is unreliable enough to be actively misleading. Revisit once there's a
  real staff-identity table to compare against.
- **External notifications** — overdue/due-today conditions are only
  visible by opening `/relationships` today.
- **Cross-linking Relationship Timeline into Resident Timeline** — once a
  Relationship is linked to a resident, should its stage changes/touches/
  actions also appear on that resident's own Timeline? Left undecided
  deliberately: doing this naively risks duplicate-event problems (the
  same principle that kept `resident_touches` out of Getting to Know),
  and the right answer likely depends on how the eventual Kanban/
  whiteboard views want to consume both timelines. Revisit once there's a
  concrete second consumer of resident-linked Relationship activity.
- **Operational visit-planning fields** — largely addressed by Part 2's
  Service Opportunity (`relationship_service_opportunities`: visits/week,
  preferred days, time windows, estimated duration, anticipated start
  date, location). Still open: nothing consumes this data to seed an
  actual AxisCare/Cinch schedule once a Relationship converts — see
  "Conversion from prospect to active client" above.
- **Website `prospects` → External Prospect Relationship integration** —
  `relationships.prospect_id` exists as an optional provenance link (see
  "The `prospects` table" above), but no UI path currently sets it —
  `createRelationship()` always passes `prospectId: null`. A website
  inquiry becoming an External Prospect Relationship, or later matching to
  a Resident Prospect Relationship, is still a fully manual re-entry today.
  Deferred per the prospect-consolidation scope's explicit instruction not
  to build full website-intake integration unless required to prevent
  conflicting prospect creation — it isn't; the two systems don't currently
  overlap.
- **Import pipeline data-quality pass** — the legacy prospect audit
  (`docs/maintenance/LEGACY_RESIDENT_PROSPECT_REVIEW.md`) surfaced two
  `resident_relationship_imports` rows whose external key points to a
  different resident than the name on the row itself (a pre-existing
  upstream data issue, not introduced by this scope). Worth a future look
  at the import pipeline, not an in-app fix.
- **`former_client` relationship type is unused** — it remains in the
  type union and check constraint for backward compatibility but no
  conversion path or UI writes it; the entire External Client "former"
  lifecycle is represented by `external_clients.status = 'former'`
  instead (see "External Clients" above). Left in place rather than
  removed, since deprecating a check-constraint value isn't required by
  this scope and doing so without auditing every historical row that
  might already carry it would be premature.
- **External Client clinical/operational depth** — no care plans,
  assessments, schedules, billing, or payroll for External Clients, by
  explicit non-goal. `relationship_service_opportunities` (reused as-is
  for External Prospects) remains the only pre-service planning surface.
- **Website `prospects` → External Client integration** — an External
  Prospect Relationship still has no path back to a `prospects` row
  originating from `serve-website`'s intake form (see "The `prospects`
  table" above); still deferred for the same reason phase 3 deferred it —
  the two systems don't currently overlap in a way that causes conflicting
  prospect creation.

Retained from `docs/design/RESIDENT_MEMORY.md`'s backlog: consider
codifying the Information Affordance Principle in the Serve Intelligence
Constitution during a future documentation governance review. Not done
here — this file is a working design note, not a constitutional document.
