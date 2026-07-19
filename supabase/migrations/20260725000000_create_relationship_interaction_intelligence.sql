begin;

-- Relationship Intelligence Phase 1 — Unified Interaction Capture. See
-- docs/architecture/decisions/0003-interaction-extends-touch.md for the
-- central decision this migration implements: Interaction EXTENDS
-- relationship_touches in place (additive columns only) rather than
-- replacing it with a new table — every existing Touch already is a valid
-- Interaction the moment these columns exist, with zero backfill.
--
-- Revised after review before first commit (see ADR 0003's "Revision"
-- section): closure/audit fields made consistent, superseded states
-- deferred, timeline noise reduced, last_meaningful_touch_at made
-- conditional, idempotency added, input validation strengthened,
-- speculative Next-Action source columns deferred, and the Working Note
-- fields the original scope asked for (and this migration's first draft
-- missed) added. Still entirely additive: no existing row is altered, no
-- existing column is dropped, no existing constraint value is removed.
--
-- Upgrade-compatibility pass (see ADR 0003's "Upgrade compatibility"
-- section): a run of this migration against a database where an earlier
-- Relationship Intelligence Phase 1 draft was already applied failed with
-- Postgres error 42P13 ("cannot change name of input parameter") on
-- resolve_relationship_commitment, because CREATE OR REPLACE FUNCTION
-- cannot rename an existing parameter, and CREATE TABLE IF NOT EXISTS is a
-- silent no-op against a table that already exists under an earlier
-- shape. This migration is now written to apply cleanly to BOTH a clean
-- database (nothing exists yet) and the shared database (the earlier
-- draft's tables/functions/indexes already exist) — every DROP ... IF
-- EXISTS added for this purpose is called out inline where it appears.

-- ─── Extend relationship_touches to carry Interaction's new fields ───────
alter table relationship_touches add column if not exists interaction_result text;
alter table relationship_touches add column if not exists participants jsonb not null default '[]'::jsonb;
-- Idempotency: a client-generated key (one per form-open), so a retried or
-- double-clicked submission returns the original Interaction instead of
-- creating a duplicate. Null for every pre-existing row and for anything
-- not submitted through log_relationship_interaction.
alter table relationship_touches add column if not exists idempotency_key text;

alter table relationship_touches drop constraint if exists relationship_touches_interaction_result_check;
alter table relationship_touches add constraint relationship_touches_interaction_result_check
  check (interaction_result is null or interaction_result in (
    'connected', 'left_voicemail', 'no_response', 'information_sent', 'information_received',
    'meeting_scheduled', 'decision_pending', 'follow_up_requested', 'not_interested',
    'service_interest_confirmed', 'other'
  ));

-- Existing values (assessment, proposal) kept — no historical row is
-- invalidated by adding the two new Interaction types.
alter table relationship_touches drop constraint if exists relationship_touches_type_check;
alter table relationship_touches add constraint relationship_touches_type_check
  check (touch_type in (
    'call', 'email', 'text', 'meeting', 'assessment', 'resident_visit', 'proposal',
    'internal_discussion', 'community_interaction', 'other'
  ));

-- Scoped to (relationship_id, idempotency_key), not idempotency_key alone —
-- the "command boundary" an idempotency key represents is a submission
-- against one specific relationship. Scoping this way makes "never return
-- an Interaction from a different relationship" true by construction: an
-- accidental key collision across two different relationships cannot even
-- register as a conflict, and log_relationship_interaction's ON CONFLICT
-- target below matches this exact index.
--
-- Upgrade compatibility: an earlier applied draft of this migration
-- created a GLOBAL unique index on idempotency_key alone
-- (relationship_touches_idempotency_key_idx) before this was corrected to
-- the composite scoping above. CREATE INDEX IF NOT EXISTS would not
-- replace it — the two indexes have different names, so Postgres would
-- happily keep both, leaving the overly strict global uniqueness in
-- place. Drop it explicitly. Safe unconditionally: relationship_touches
-- currently has no rows with idempotency_key set (every row that did was
-- deleted in the Phase 1 synthetic-data cleanup), so there is nothing for
-- either index to conflict over at the time this runs.
drop index if exists relationship_touches_idempotency_key_idx;

create unique index if not exists relationship_touches_relationship_idempotency_key_idx
  on relationship_touches (relationship_id, idempotency_key) where idempotency_key is not null;

comment on column relationship_touches.interaction_result is
  'Structured result of the interaction (distinct from the free-text outcome column) — Relationship Intelligence Phase 1. Null for legacy touch rows recorded before this column existed.';
comment on column relationship_touches.participants is
  'Lightweight structured people-involved capture: [{role, name, personId?}]. Not a new relational table — personId, when present, points at an existing resident/relationship identity, never a duplicate.';
comment on column relationship_touches.idempotency_key is
  'Client-generated, one per Log Interaction form session. Lets log_relationship_interaction() detect a retried/double-clicked submission and return the original row rather than duplicate it. Uniquely scoped per relationship, not globally.';

-- Durable schema invariant, not just RPC-level validation — a defense the
-- database itself holds regardless of caller. Safe to add unconditionally:
-- participants is a brand-new column in this same migration
-- (`add column ... not null default '[]'::jsonb`, above), so every row —
-- old and new alike — already received the '[]'::jsonb default the moment
-- the column was created, and jsonb_typeof('[]'::jsonb) = 'array'. There is
-- no pre-existing data this could ever reject.
alter table relationship_touches drop constraint if exists relationship_touches_participants_is_array_check;
alter table relationship_touches add constraint relationship_touches_participants_is_array_check
  check (jsonb_typeof(participants) = 'array');

-- ─── Relationship Insights ────────────────────────────────────────────────
-- What Serve learned that may matter later. Attributable to a source
-- Interaction (relationship_touches row). "Linked contact" is free text,
-- matching relationship_touches.contact_name's own convention — this
-- codebase has no separate Contact master record.
--
-- Deletion/provenance policy (see ADR 0003's Revision section): no RPC in
-- this codebase ever deletes a relationship_touches row, and
-- source_interaction_id deliberately has NO explicit "on delete" clause
-- (defaults to NO ACTION/RESTRICT) rather than "on delete set null" — if a
-- hard-delete path for Interactions is ever added, it must not be able to
-- silently orphan an Insight/Commitment/Open Loop's provenance. Deleting a
-- Relationship itself still cascades (relationship_id's own FK), which is
-- the only deletion path that exists today.
create table if not exists relationship_insights (
  id                    uuid primary key default gen_random_uuid(),
  relationship_id       uuid not null references public.relationships(id) on delete cascade,
  resident_id           uuid references public.residents(id) on delete set null,
  contact_name          text,

  content               text not null,
  category              text not null,
  why_it_matters        text,

  status                text not null default 'active',
  relevant_until        date,

  source_interaction_id uuid references public.relationship_touches(id),

  created_by            text not null,
  created_at            timestamptz not null default now(),
  updated_by            text,
  updated_at            timestamptz not null default now(),
  resolved_at           timestamptz,
  resolved_by           text,

  constraint relationship_insights_content_not_blank
    check (length(trim(content)) > 0),

  constraint relationship_insights_category_check
    check (category in (
      'resident_preference', 'family_context', 'decision_dynamics', 'communication_preference',
      'timing', 'service_need', 'concern_or_barrier', 'financial_consideration',
      'community_context', 'operational', 'other'
    )),

  constraint relationship_insights_status_check
    check (status in ('active', 'resolved', 'outdated')),

  -- Bidirectional: active requires no closure metadata; resolved/outdated
  -- require it. The first draft of this migration only checked the
  -- "active" direction, silently allowing a resolved/outdated row with no
  -- resolved_at/resolved_by at all.
  constraint relationship_insights_resolved_fields_check
    check (
      (status = 'active' and resolved_at is null and resolved_by is null)
      or (status in ('resolved', 'outdated') and resolved_at is not null and resolved_by is not null)
    )
);

create index if not exists relationship_insights_relationship_idx
  on relationship_insights (relationship_id, status, created_at desc);

alter table relationship_insights enable row level security;
-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this app.

-- Upgrade compatibility: relationship_insights may already exist from an
-- earlier applied Phase 1 draft, in which case CREATE TABLE IF NOT EXISTS
-- above was a no-op and none of its column/constraint definitions took
-- effect. Bring an already-existing table up to the final shape
-- explicitly. All of these are also safe (redundant no-ops) against a
-- table this same migration just created fresh.
alter table relationship_insights add column if not exists updated_by text;
alter table relationship_insights add column if not exists updated_at timestamptz not null default now();

-- The earlier draft's source_interaction_id FK used "on delete set null";
-- the final design deliberately has no explicit "on delete" clause
-- (NO ACTION) so a future Interaction hard-delete cannot silently orphan
-- an Insight's provenance instead of being blocked (see ADR 0003's
-- Revision section). Postgres's default constraint name for an inline FK
-- is "<table>_<column>_fkey".
alter table relationship_insights drop constraint if exists relationship_insights_source_interaction_id_fkey;
alter table relationship_insights add constraint relationship_insights_source_interaction_id_fkey
  foreign key (source_interaction_id) references public.relationship_touches(id);

alter table relationship_insights drop constraint if exists relationship_insights_resolved_fields_check;
alter table relationship_insights add constraint relationship_insights_resolved_fields_check
  check (
    (status = 'active' and resolved_at is null and resolved_by is null)
    or (status in ('resolved', 'outdated') and resolved_at is not null and resolved_by is not null)
  );

create or replace function relationship_insights_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on relationship_insights;
create trigger set_updated_at
  before update on relationship_insights
  for each row execute function relationship_insights_set_updated_at();

-- ─── Relationship Commitments ─────────────────────────────────────────────
-- "superseded" deferred (see ADR 0003's Revision section) — nothing in
-- this phase implements a real supersede workflow (linking a commitment to
-- the one that replaces it), so the status is not offered until that
-- workflow exists. Closure fields are consistent regardless of which
-- terminal status (completed/cancelled) is reached: closed_at, closed_by,
-- closure_note — status itself distinguishes which one happened.
create table if not exists relationship_commitments (
  id                      uuid primary key default gen_random_uuid(),
  relationship_id         uuid not null references public.relationships(id) on delete cascade,

  description             text not null,
  responsible_party_type  text not null,
  responsible_party_reference text,
  expected_date           date,

  status                  text not null default 'open',
  closed_at               timestamptz,
  closed_by               text,
  closure_note            text,

  source_interaction_id   uuid references public.relationship_touches(id),

  created_by              text not null,
  created_at              timestamptz not null default now(),
  updated_by              text,
  updated_at              timestamptz not null default now(),

  constraint relationship_commitments_description_not_blank
    check (length(trim(description)) > 0),

  constraint relationship_commitments_party_type_check
    check (responsible_party_type in ('serve', 'family', 'resident', 'community', 'referral_source', 'other')),

  constraint relationship_commitments_status_check
    check (status in ('open', 'completed', 'cancelled')),

  constraint relationship_commitments_closure_fields_check
    check (
      (status = 'open' and closed_at is null and closed_by is null)
      or (status in ('completed', 'cancelled') and closed_at is not null and closed_by is not null)
    )
);

create index if not exists relationship_commitments_relationship_idx
  on relationship_commitments (relationship_id, status, expected_date);

alter table relationship_commitments enable row level security;

-- Upgrade compatibility: relationship_commitments may already exist from
-- an earlier applied Phase 1 draft using completion terminology
-- (completion_note/completed_at, no closed_by, one-directional status
-- check, 'superseded' still a valid status) instead of the final closure
-- terminology — CREATE TABLE IF NOT EXISTS above is a no-op against it.
-- Rename the renamed columns only if the old names are actually present
-- (a fresh install's table already has the final names, so this is a
-- no-op there).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'relationship_commitments' and column_name = 'completion_note'
  ) then
    alter table relationship_commitments rename column completion_note to closure_note;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'relationship_commitments' and column_name = 'completed_at'
  ) then
    alter table relationship_commitments rename column completed_at to closed_at;
  end if;
end $$;

alter table relationship_commitments add column if not exists closed_by text;
alter table relationship_commitments add column if not exists updated_by text;
alter table relationship_commitments add column if not exists updated_at timestamptz not null default now();

-- Same FK-tightening rationale as relationship_insights above.
alter table relationship_commitments drop constraint if exists relationship_commitments_source_interaction_id_fkey;
alter table relationship_commitments add constraint relationship_commitments_source_interaction_id_fkey
  foreign key (source_interaction_id) references public.relationship_touches(id);

-- 'superseded' is dropped from the vocabulary (no supersede workflow
-- exists — see ADR 0003's Revision section). relationship_commitments is
-- confirmed empty in the shared project (all synthetic Phase 1 demo data
-- was removed in the prior cleanup pass), so narrowing this list cannot
-- reject any existing row.
alter table relationship_commitments drop constraint if exists relationship_commitments_status_check;
alter table relationship_commitments add constraint relationship_commitments_status_check
  check (status in ('open', 'completed', 'cancelled'));

-- The earlier draft's completion-fields check was named
-- relationship_commitments_completion_fields_check and only checked one
-- direction (status = 'completed' or completed_at is null); renaming the
-- columns above does not rename this constraint or fix its logic, and the
-- final migration never defines anything under the old name, so it must
-- be dropped explicitly or it would remain in force alongside the new one.
alter table relationship_commitments drop constraint if exists relationship_commitments_completion_fields_check;
alter table relationship_commitments drop constraint if exists relationship_commitments_closure_fields_check;
alter table relationship_commitments add constraint relationship_commitments_closure_fields_check
  check (
    (status = 'open' and closed_at is null and closed_by is null)
    or (status in ('completed', 'cancelled') and closed_at is not null and closed_by is not null)
  );

create or replace function relationship_commitments_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on relationship_commitments;
create trigger set_updated_at
  before update on relationship_commitments
  for each row execute function relationship_commitments_set_updated_at();

-- ─── Relationship Open Loops ──────────────────────────────────────────────
-- "superseded" deferred, same rationale as Commitments above.
create table if not exists relationship_open_loops (
  id                      uuid primary key default gen_random_uuid(),
  relationship_id         uuid not null references public.relationships(id) on delete cascade,

  question                text not null,
  owner                   text,
  target_resolution_date  date,

  status                  text not null default 'open',
  resolution              text,
  resolved_at             timestamptz,
  resolved_by             text,

  source_interaction_id   uuid references public.relationship_touches(id),

  created_by              text not null,
  created_at              timestamptz not null default now(),
  updated_by              text,
  updated_at              timestamptz not null default now(),

  constraint relationship_open_loops_question_not_blank
    check (length(trim(question)) > 0),

  constraint relationship_open_loops_status_check
    check (status in ('open', 'resolved', 'no_longer_relevant')),

  constraint relationship_open_loops_resolved_fields_check
    check (
      (status = 'open' and resolved_at is null and resolved_by is null)
      or (status in ('resolved', 'no_longer_relevant') and resolved_at is not null and resolved_by is not null)
    )
);

create index if not exists relationship_open_loops_relationship_idx
  on relationship_open_loops (relationship_id, status, target_resolution_date);

alter table relationship_open_loops enable row level security;

-- Upgrade compatibility: relationship_open_loops may already exist from an
-- earlier applied Phase 1 draft with no resolved_by/updated_at/updated_by
-- columns, a one-directional resolved_fields_check, and 'superseded' still
-- a valid status — CREATE TABLE IF NOT EXISTS above is a no-op against it.
alter table relationship_open_loops add column if not exists resolved_by text;
alter table relationship_open_loops add column if not exists updated_by text;
alter table relationship_open_loops add column if not exists updated_at timestamptz not null default now();

-- Same FK-tightening rationale as relationship_insights above.
alter table relationship_open_loops drop constraint if exists relationship_open_loops_source_interaction_id_fkey;
alter table relationship_open_loops add constraint relationship_open_loops_source_interaction_id_fkey
  foreign key (source_interaction_id) references public.relationship_touches(id);

-- relationship_open_loops is confirmed empty (same cleanup verification as
-- relationship_commitments above) — safe to narrow the status vocabulary
-- and tighten the resolved-fields check unconditionally. Both constraints
-- keep their original names across drafts, so this drop-and-readd also
-- covers the case where resolved_by didn't exist yet when the constraint
-- was first created (the column add above runs first in this same
-- transaction).
alter table relationship_open_loops drop constraint if exists relationship_open_loops_status_check;
alter table relationship_open_loops add constraint relationship_open_loops_status_check
  check (status in ('open', 'resolved', 'no_longer_relevant'));

alter table relationship_open_loops drop constraint if exists relationship_open_loops_resolved_fields_check;
alter table relationship_open_loops add constraint relationship_open_loops_resolved_fields_check
  check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status in ('resolved', 'no_longer_relevant') and resolved_at is not null and resolved_by is not null)
  );

create or replace function relationship_open_loops_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on relationship_open_loops;
create trigger set_updated_at
  before update on relationship_open_loops
  for each row execute function relationship_open_loops_set_updated_at();

-- ─── relationship_actions: trace a Next Action back to what spawned it ────
-- Only source_interaction_id is added — a Next Action is only ever created
-- from an Interaction submission in this phase (see
-- log_relationship_interaction below). source_commitment_id/
-- source_open_loop_id were speculative in the first draft of this
-- migration (nothing set them) and are deferred until a real workflow
-- creates an Action directly from one of those records.
--
-- Upgrade compatibility: an earlier applied draft added those two
-- speculative FK columns for real. Drop them if present — dropping a
-- column drops its FK constraint with it, so no separate constraint drop
-- is needed for these two. Safe: nothing ever set them, so there is no
-- data to lose.
alter table relationship_actions drop column if exists source_commitment_id;
alter table relationship_actions drop column if exists source_open_loop_id;

alter table relationship_actions add column if not exists source_interaction_id uuid
  references public.relationship_touches(id);

-- The earlier draft's source_interaction_id FK (if the column already
-- existed) used "on delete set null"; the final design deliberately has
-- no explicit "on delete" clause (NO ACTION), matching the same
-- provenance-protection rationale as the three tables above. Re-point the
-- constraint explicitly rather than relying on ADD COLUMN IF NOT EXISTS,
-- which does nothing when the column already exists under the old FK
-- behavior.
alter table relationship_actions drop constraint if exists relationship_actions_source_interaction_id_fkey;
alter table relationship_actions add constraint relationship_actions_source_interaction_id_fkey
  foreign key (source_interaction_id) references public.relationship_touches(id);

-- ─── relationship_working_notes: the fields the original scope asked for ──
-- Missed in this migration's first draft. Working Notes should support "an
-- optional expiration or review date, source description, linked
-- resident, linked contact" per the scope — all additive, nullable
-- columns; the existing open/resolved/archived status vocabulary is left
-- unchanged (functionally equivalent to the scope's "active/resolved/
-- outdated" language — renaming a working, already-populated status
-- column is a content decision, not a schema one, and risks
-- mischaracterizing real prototype data; see ADR 0003).
alter table relationship_working_notes add column if not exists relevant_until date;
alter table relationship_working_notes add column if not exists resident_id uuid references public.residents(id) on delete set null;
alter table relationship_working_notes add column if not exists contact_name text;
-- Free text, not a source_interaction_id FK — Working Notes are
-- specifically for information that did NOT arise from a formal
-- Interaction (see this document's own module comment), so a formal FK
-- to one would misrepresent most real usage.
alter table relationship_working_notes add column if not exists source_description text;

-- ─── relationship_timeline: new event types, existing values untouched ───
-- Reduced from the first draft: insight_recorded/commitment_created/
-- open_loop_created are removed — one interaction_logged event per
-- submission already covers initial capture (its event_description now
-- summarizes what was captured); a distinct event is only warranted when
-- something is later CLOSED (commitment_resolved, open_loop_resolved).
alter table relationship_timeline drop constraint if exists relationship_timeline_event_type_check;
alter table relationship_timeline add constraint relationship_timeline_event_type_check
  check (event_type in (
    'relationship_created', 'resident_linked', 'stage_changed', 'touch_logged',
    'action_created', 'action_updated', 'action_completed', 'action_dismissed',
    'relationship_won', 'relationship_on_hold', 'relationship_closed',
    'working_note_created', 'working_note_resolved', 'service_opportunity_updated',
    'relationship_updated', 'relationship_converted', 'external_client_status_changed',
    'service_location_updated', 'website_inquiry_received',
    'interaction_logged', 'commitment_resolved', 'open_loop_resolved'
  ));

-- ─── Atomic multi-record write: log_relationship_interaction ─────────────
-- One conversation, one submission. Inserts the interaction row directly
-- (relationship_touches, using the extended columns — supersedes calling
-- the narrower log_relationship_touch for this path), conditionally
-- advances last_meaningful_touch_at, then loops the three optional jsonb
-- arrays inserting Insights/Commitments/Open Loops, then — only if a Next
-- Action was explicitly submitted — calls the existing
-- create_relationship_action RPC with source_interaction_id set. One
-- plpgsql function body is one transaction: a partial submission never
-- leaves an Interaction recorded without its explicitly-submitted
-- accountability records.
--
-- Upgrade compatibility: the earlier applied draft's log_relationship_interaction
-- took 14 parameters (no p_idempotency_key). Adding a new trailing
-- parameter changes the function's argument-type signature, so CREATE OR
-- REPLACE FUNCTION would not replace that version — Postgres identifies
-- functions by (name, parameter types), so a different type list is a
-- distinct overload, not a replacement, leaving the old 14-parameter
-- version (with no idempotency support) callable alongside the new one.
-- Drop the old signature explicitly first (same pattern already used
-- below for create_relationship_working_note, and in
-- 20260718000000_add_relationship_test_marker.sql for create_relationship).
drop function if exists public.log_relationship_interaction(
  uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text
);

create or replace function log_relationship_interaction(
  p_relationship_id uuid,
  p_touch_type text,
  p_occurred_at timestamptz,
  p_summary text,
  p_interaction_result text,
  p_outcome text,
  p_contact_name text,
  p_participants jsonb,
  p_insights jsonb default '[]'::jsonb,
  p_commitments jsonb default '[]'::jsonb,
  p_open_loops jsonb default '[]'::jsonb,
  p_next_action jsonb default null,
  p_actor text default null,
  p_test_marker text default null,
  p_idempotency_key text default null
)
returns relationship_touches
language plpgsql
set search_path = public
as $$
declare
  v_display_name text;
  v_interaction relationship_touches%rowtype;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_item jsonb;
  v_participant jsonb;
  v_insight_count integer := 0;
  v_commitment_count integer := 0;
  v_open_loop_count integer := 0;
  v_action_id uuid;
  v_is_meaningful boolean;
  v_summary_note text;
begin
  -- ─── Required-input validation (always runs — cheap, no writes) ───────
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to log an interaction';
  end if;

  if p_touch_type is null or length(trim(p_touch_type)) = 0 then
    raise exception 'An interaction type is required';
  end if;

  if p_summary is null or length(trim(p_summary)) = 0 then
    raise exception 'Describe what happened in this interaction';
  end if;

  if jsonb_typeof(coalesce(p_participants, '[]'::jsonb)) <> 'array' then
    raise exception 'participants must be a JSON array';
  end if;
  if jsonb_typeof(coalesce(p_insights, '[]'::jsonb)) <> 'array' then
    raise exception 'insights must be a JSON array';
  end if;
  if jsonb_typeof(coalesce(p_commitments, '[]'::jsonb)) <> 'array' then
    raise exception 'commitments must be a JSON array';
  end if;
  if jsonb_typeof(coalesce(p_open_loops, '[]'::jsonb)) <> 'array' then
    raise exception 'open_loops must be a JSON array';
  end if;
  if p_next_action is not null and jsonb_typeof(p_next_action) <> 'object' then
    raise exception 'next_action must be a JSON object';
  end if;

  -- Shape-validate each participant at the RPC boundary too, not just in
  -- the calling TypeScript — defense in depth for any future caller that
  -- bypasses the application layer.
  for v_participant in select * from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb))
  loop
    if jsonb_typeof(v_participant) <> 'object'
      or coalesce(trim(v_participant->>'name'), '') = ''
      or coalesce(trim(v_participant->>'role'), '') = ''
    then
      raise exception 'Each participant requires a role and a name';
    end if;
  end loop;

  select display_name into v_display_name from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  -- ─── Concurrency-safe idempotent insert ───────────────────────────────
  -- A plain "select, then insert if not found" has a race: two concurrent
  -- calls with the same key can both pass the select and then both attempt
  -- to insert, with the loser surfacing a raw unique_violation instead of
  -- getting the original row back. ON CONFLICT handles this natively at
  -- the index level: if a concurrent transaction is mid-insert of the same
  -- (relationship_id, idempotency_key), Postgres waits for it to finish
  -- before deciding whether this insert conflicts — so by the time control
  -- reaches the fallback select below, the winning row is guaranteed to be
  -- visible (or, if the other transaction rolled back, this insert simply
  -- succeeds instead, since there is no longer anything to conflict with).
  insert into relationship_touches (
    relationship_id, touch_type, occurred_at, summary, interaction_result, outcome, contact_name,
    participants, created_by, source_type, idempotency_key
  ) values (
    p_relationship_id, p_touch_type, v_occurred_at, p_summary, p_interaction_result, p_outcome, p_contact_name,
    coalesce(p_participants, '[]'::jsonb), p_actor, 'manual', p_idempotency_key
  )
  on conflict (relationship_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning * into v_interaction;

  if v_interaction.id is null then
    -- Only reachable when p_idempotency_key was non-null and a row already
    -- existed for this exact (relationship_id, idempotency_key) pair — a
    -- genuine retry/double-click, sequential or concurrent. Scoped to
    -- p_relationship_id by construction (the unique index itself is
    -- composite), so this can never return an Interaction belonging to a
    -- different relationship.
    select * into v_interaction
    from relationship_touches
    where relationship_id = p_relationship_id and idempotency_key = p_idempotency_key;

    if v_interaction.id is null then
      -- Should be unreachable given the ON CONFLICT target above, but
      -- fail loudly rather than silently returning an empty row if it
      -- ever is.
      raise exception 'Could not resolve the idempotent Interaction for this relationship';
    end if;

    return v_interaction;
  end if;

  -- Only a result indicating real engagement counts as "meaningful" —
  -- matches the field's own name. A voicemail or no-response attempt is a
  -- real, worth-recording interaction, but it isn't contact, and
  -- shouldn't reset the "how long since we actually reached someone"
  -- clock the rest of the app (attention/overdue derivation) relies on.
  v_is_meaningful := coalesce(p_interaction_result, 'connected') not in ('left_voicemail', 'no_response');

  if v_is_meaningful then
    update relationships
    set last_meaningful_touch_at = greatest(coalesce(last_meaningful_touch_at, v_occurred_at), v_occurred_at),
        updated_by = p_actor,
        test_marker = coalesce(test_marker, p_test_marker)
    where id = p_relationship_id;
  else
    update relationships
    set updated_by = p_actor,
        test_marker = coalesce(test_marker, p_test_marker)
    where id = p_relationship_id;
  end if;

  -- ─── Insights / Commitments / Open Loops — no per-item Timeline event ──
  -- One interaction_logged event already represents this whole submission;
  -- counts are folded into its description instead of one event per
  -- child row. A distinct event is only warranted when something is later
  -- closed (see resolve_relationship_commitment/resolve_relationship_open_loop).
  for v_item in select * from jsonb_array_elements(coalesce(p_insights, '[]'::jsonb))
  loop
    insert into relationship_insights (
      relationship_id, resident_id, contact_name, content, category, why_it_matters,
      relevant_until, source_interaction_id, created_by
    ) values (
      p_relationship_id,
      nullif(v_item->>'residentId', '')::uuid,
      nullif(v_item->>'contactName', ''),
      v_item->>'content',
      v_item->>'category',
      nullif(v_item->>'whyItMatters', ''),
      nullif(v_item->>'relevantUntil', '')::date,
      v_interaction.id,
      p_actor
    );
    v_insight_count := v_insight_count + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_commitments, '[]'::jsonb))
  loop
    insert into relationship_commitments (
      relationship_id, description, responsible_party_type, responsible_party_reference,
      expected_date, source_interaction_id, created_by
    ) values (
      p_relationship_id,
      v_item->>'description',
      v_item->>'responsiblePartyType',
      nullif(v_item->>'responsiblePartyReference', ''),
      nullif(v_item->>'expectedDate', '')::date,
      v_interaction.id,
      p_actor
    );
    v_commitment_count := v_commitment_count + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_open_loops, '[]'::jsonb))
  loop
    insert into relationship_open_loops (
      relationship_id, question, owner, target_resolution_date, source_interaction_id, created_by
    ) values (
      p_relationship_id,
      v_item->>'question',
      nullif(v_item->>'owner', ''),
      nullif(v_item->>'targetResolutionDate', '')::date,
      v_interaction.id,
      p_actor
    );
    v_open_loop_count := v_open_loop_count + 1;
  end loop;

  v_summary_note := p_summary;
  if v_insight_count > 0 or v_commitment_count > 0 or v_open_loop_count > 0 then
    v_summary_note := v_summary_note || ' (' ||
      array_to_string(array_remove(array[
        case when v_insight_count > 0 then v_insight_count || ' insight' || case when v_insight_count > 1 then 's' else '' end else null end,
        case when v_commitment_count > 0 then v_commitment_count || ' commitment' || case when v_commitment_count > 1 then 's' else '' end else null end,
        case when v_open_loop_count > 0 then v_open_loop_count || ' open loop' || case when v_open_loop_count > 1 then 's' else '' end else null end
      ], null), ', ') || ')';
  end if;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'interaction_logged', v_display_name || ': ' || initcap(p_touch_type) || ' logged.',
    v_summary_note, 'relationship_touches', v_interaction.id, p_actor, true
  );

  -- ─── Next Action (composes the existing single-purpose RPC) ──────────
  if p_next_action is not null then
    v_action_id := create_relationship_action(
      p_relationship_id,
      p_next_action->>'actionType',
      p_next_action->>'title',
      nullif(p_next_action->>'description', ''),
      nullif(p_next_action->>'dueAt', '')::timestamptz,
      nullif(p_next_action->>'assignedTo', ''),
      coalesce(p_next_action->>'priority', 'normal'),
      p_actor
    );
    update relationship_actions set source_interaction_id = v_interaction.id where id = v_action_id;
  end if;

  return v_interaction;
end;
$$;

revoke execute on function log_relationship_interaction(
  uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text
) from public;
grant execute on function log_relationship_interaction(
  uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, text
) to service_role;

-- ─── Lifecycle: resolve Insight / Commitment / Open Loop ─────────────────
-- Same no-op-if-already-resolved shape as resolve_relationship_working_note.
--
-- Upgrade compatibility: these three functions did not exist in this
-- migration's true first draft, but were present in a later working
-- revision that reached the shared database before this final,
-- upgrade-safe version — resolve_relationship_commitment specifically was
-- confirmed live with a parameter named p_completion_note, causing
-- Postgres error 42P13 ("cannot change name of input parameter") when
-- this migration tried to CREATE OR REPLACE it under the final name
-- p_closure_note. CREATE OR REPLACE FUNCTION cannot rename an existing
-- parameter even when every type stays the same — Postgres requires an
-- explicit DROP first. Applied defensively to all three functions here,
-- since the same-signature/renamed-parameter hazard could affect any of
-- them, not just the one that already surfaced.
drop function if exists public.resolve_relationship_insight(uuid, text, text);

create or replace function resolve_relationship_insight(
  p_insight_id uuid,
  p_status text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_current_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update an insight';
  end if;
  if p_status not in ('resolved', 'outdated') then
    raise exception 'Invalid insight status';
  end if;

  select status into v_current_status from relationship_insights where id = p_insight_id for update;
  if not found then
    raise exception 'Insight not found';
  end if;
  if v_current_status <> 'active' then
    return;
  end if;

  update relationship_insights
  set status = p_status, resolved_at = now(), resolved_by = p_actor,
      updated_at = now(), updated_by = p_actor
  where id = p_insight_id;
end;
$$;

revoke execute on function resolve_relationship_insight(uuid, text, text) from public;
grant execute on function resolve_relationship_insight(uuid, text, text) to service_role;

-- Confirmed the exact cause of the reported upgrade failure: the earlier
-- applied revision named this parameter p_completion_note.
drop function if exists public.resolve_relationship_commitment(uuid, text, text, text);

create or replace function resolve_relationship_commitment(
  p_commitment_id uuid,
  p_status text,
  p_closure_note text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_relationship_id uuid;
  v_current_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update a commitment';
  end if;
  if p_status not in ('completed', 'cancelled') then
    raise exception 'Invalid commitment status';
  end if;

  select relationship_id, status into v_relationship_id, v_current_status
  from relationship_commitments where id = p_commitment_id for update;
  if not found then
    raise exception 'Commitment not found';
  end if;
  if v_current_status <> 'open' then
    return;
  end if;

  update relationship_commitments
  set status = p_status,
      closure_note = p_closure_note,
      closed_at = now(),
      closed_by = p_actor,
      updated_at = now(),
      updated_by = p_actor
  where id = p_commitment_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    v_relationship_id, 'commitment_resolved',
    case when p_status = 'completed' then 'Commitment completed.' else 'Commitment cancelled.' end,
    p_closure_note, 'relationship_commitments', p_commitment_id, p_actor, true
  );
end;
$$;

revoke execute on function resolve_relationship_commitment(uuid, text, text, text) from public;
grant execute on function resolve_relationship_commitment(uuid, text, text, text) to service_role;

drop function if exists public.resolve_relationship_open_loop(uuid, text, text, text);

create or replace function resolve_relationship_open_loop(
  p_open_loop_id uuid,
  p_status text,
  p_resolution text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_relationship_id uuid;
  v_current_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update an open loop';
  end if;
  if p_status not in ('resolved', 'no_longer_relevant') then
    raise exception 'Invalid open loop status';
  end if;

  select relationship_id, status into v_relationship_id, v_current_status
  from relationship_open_loops where id = p_open_loop_id for update;
  if not found then
    raise exception 'Open loop not found';
  end if;
  if v_current_status <> 'open' then
    return;
  end if;

  update relationship_open_loops
  set status = p_status, resolution = p_resolution, resolved_at = now(), resolved_by = p_actor,
      updated_at = now(), updated_by = p_actor
  where id = p_open_loop_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    v_relationship_id, 'open_loop_resolved', 'Open loop resolved.', p_resolution,
    'relationship_open_loops', p_open_loop_id, p_actor, true
  );
end;
$$;

revoke execute on function resolve_relationship_open_loop(uuid, text, text, text) from public;
grant execute on function resolve_relationship_open_loop(uuid, text, text, text) to service_role;

-- ─── create_relationship_working_note: extended with the scope's fields ──
-- Postgres identifies functions by (name, parameter types) — adding new
-- trailing parameters creates a distinct overload rather than replacing
-- the 4-parameter original, so the old signature must be dropped
-- explicitly (same reason 20260718000000_add_relationship_test_marker.sql
-- dropped create_relationship's old signature when it gained a trailing
-- parameter).
drop function if exists create_relationship_working_note(uuid, text, text, text);

create or replace function create_relationship_working_note(
  p_relationship_id uuid,
  p_content text,
  p_category text,
  p_actor text,
  p_relevant_until date default null,
  p_resident_id uuid default null,
  p_contact_name text default null,
  p_source_description text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_note_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to add a working note';
  end if;

  if length(trim(p_content)) = 0 then
    raise exception 'Working note content cannot be blank';
  end if;

  insert into relationship_working_notes (
    relationship_id, content, category, created_by,
    relevant_until, resident_id, contact_name, source_description
  ) values (
    p_relationship_id, p_content, p_category, p_actor,
    p_relevant_until, p_resident_id, p_contact_name, p_source_description
  )
  returning id into v_note_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'working_note_created', 'Working note added.',
    case when p_category is not null then initcap(p_category) || ' working note added.' else null end,
    'relationship_working_notes', v_note_id, p_actor, true
  );

  return v_note_id;
end;
$$;

revoke execute on function create_relationship_working_note(uuid, text, text, text, date, uuid, text, text) from public;
grant execute on function create_relationship_working_note(uuid, text, text, text, date, uuid, text, text) to service_role;

commit;
