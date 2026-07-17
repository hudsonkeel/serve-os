# Relationships — Conceptual Model

Status: phase 1 (foundation) + phase 2 (Daily Action Board, Operational
Whiteboard, Service Opportunity) + phase 3 (prospect consolidation)
implemented — data model, three views (`/relationships/actions` Action
Board, `/relationships/whiteboard` Whiteboard, `/relationships` All
Relationships), `/relationships/[id]` detail page, resident linking, stage
history, touches, next actions with edit/audit, working notes, Relationship
Timeline, early nonclinical service-opportunity planning, and full
Resident Prospect creation with duplicate prevention. No Kanban, no
drag-and-drop, no proposal/assessment workflow integration, no
notifications. See "Non-goals" and "Backlog" below.

> **A prospect is a Relationship type, not a Resident classification.**
> The Residents module has no "Serve Prospect" concept — see "Prospect
> status belongs exclusively to Relationships" below.

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
| `external_prospect` | A prospective customer or family inquiry not yet connected to a resident |
| `active_client` | An active Serve customer relationship |
| `former_client` | A prior customer relationship, possibly reactivated later |
| `referral_source` | A person or organization that refers prospective customers |
| `community_partner` | A senior-living community or related organizational relationship |
| `professional_contact` | A physician, hospital contact, social worker, care manager, etc. |
| `other` | Anything not covered above |

Phase 1's UI and pipeline logic are built around `resident_prospect` and
`external_prospect` — the other six types are fully representable (they
can be created, staged, searched, and filtered) but don't get
sales-pipeline-specific treatment like the workspace's attention-status
derivation.

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
(`won`/`closed_lost` → `closed`; `on_hold` → `on_hold`; anything else →
`active`) — see `change_relationship_stage()` in
`20260717000000_create_relationships_core.sql`.

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
- **Conversion from prospect to active client** — moving a `stage` to
  `won` does not currently change `relationship_type` from
  `resident_prospect`/`external_prospect` to `active_client`; that
  transition (and whether it should be automatic) is undecided.
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

Retained from `docs/design/RESIDENT_MEMORY.md`'s backlog: consider
codifying the Information Affordance Principle in the Serve Intelligence
Constitution during a future documentation governance review. Not done
here — this file is a working design note, not a constitutional document.
