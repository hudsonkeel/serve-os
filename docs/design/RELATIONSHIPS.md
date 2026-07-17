# Relationships — Conceptual Model

Status: phase 1 (foundation) implemented — data model, `/relationships`
workspace, `/relationships/[id]` detail page, resident linking, stage
history, touches, next actions with edit/audit, working notes, and
Relationship Timeline. No Kanban, no drag-and-drop, no proposal/assessment
workflow integration, no notifications. See "Non-goals" and "Backlog"
below.

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

## Relationship Type

What kind of Serve relationship this is (`relationships.relationship_type`):

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

## Files

**Migrations**: `20260717000000_create_relationships_core.sql`
(`relationships`, `relationship_stage_history`, `relationship_timeline`,
`create_relationship`/`change_relationship_stage`/
`link_relationship_to_resident`), `20260717010000_create_relationship_touches.sql`,
`20260717020000_create_relationship_actions.sql`,
`20260717030000_create_relationship_working_notes.sql`.

**Pure logic**: `lib/relationships/constants.ts` (controlled values +
labels), `lib/relationships/validation.ts`, `lib/relationships/attention.ts`,
`lib/relationships/search.ts` — all independently unit tested
(`lib/relationships/__tests__/*.test.ts`).

**Data/actions**: `lib/data/relationships.ts`, `lib/actions/relationships.ts`.

**UI**: `app/relationships/page.tsx` + `components/relationships/RelationshipsWorkspace.tsx`
(table, filters, attention counts, search — hides zero-result states the
same way the Residents search page does), `AddExternalProspectForm.tsx`;
`app/relationships/[id]/page.tsx` + `RelationshipOverview.tsx` (stage
change, resident linking), `RelationshipActionsList.tsx`,
`RelationshipWorkingNotesSection.tsx`, `RelationshipTouchesSection.tsx`,
`RelationshipTimelineSection.tsx`; `components/residents/StartRelationshipCard.tsx`
(the resident-page entry point).

## Non-goals of this phase

Full Kanban pipeline, drag-and-drop stages, Brian's final whiteboard/
table customization, service-day/quantity/time scheduling fields,
proposal builder, assessment automation, email sending, Gmail
integration, call-system integration, SMS integration, calendar
integration, recurring tasks, external notifications, Resident
Intelligence, Cinch/AxisCare synchronization, resident deduplication or
merging, organization CRM depth, referral commission tracking, sales
forecasting, revenue projections, Constitution amendments.

## Backlog

- **Kanban pipeline** — a drag-and-drop stage board, reading/writing the
  same `relationships` records this phase establishes.
- **Brian's whiteboard/table configuration** — customizable columns/views
  over the workspace table.
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
  exists yet (see "Ownership and staff identity" above).
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
- **Operational visit-planning fields** — preferred days, quantity,
  times, duration, expected start date. None of this phase's schema
  attempts to model a service plan.

Retained from `docs/design/RESIDENT_MEMORY.md`'s backlog: consider
codifying the Information Affordance Principle in the Serve Intelligence
Constitution during a future documentation governance review. Not done
here — this file is a working design note, not a constitutional document.
