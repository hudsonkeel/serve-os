begin;

-- Relationship CRM foundation, phase 1. See docs/design/RELATIONSHIPS.md
-- for the full conceptual model. In short:
--
--   Resident      = identity ("who is this person, do they live/receive
--                    care in a community?"). May exist with zero Serve
--                    sales/service engagement.
--   Relationship  = engagement ("what is Serve's active relationship with
--                    this person/family/organization?"). May exist with
--                    zero resident record — an external prospect who
--                    contacted Serve before any resident record exists.
--
-- Staff-identity note: every actor column below is `text`, not `uuid` —
-- same convention as every other table in this app (see
-- 20260712010000_create_resident_wellness_follow_ups.sql's comment, and
-- resident_relationship_profiles.relationship_owner_user_id in
-- 20260711000000_create_resident_connections.sql, which tried a uuid owner
-- column and left it deliberately unconstrained because there is no uuid
-- staff identifier anywhere in this app to reference — user_profiles is
-- keyed by email and exposes no id). owner_label is one field, not a
-- uuid/display-name pair, for the same reason.
--
-- Community-model note: there is no `communities`/`organizations` table
-- anywhere in this codebase (confirmed by exhaustive grep across
-- serve-os, serve-website, serve-intake-mvp) — community_name here is a
-- denormalized text field, matching residents.community_name exactly, not
-- a foreign key.

create table if not exists relationships (
  id                        uuid primary key default gen_random_uuid(),

  relationship_type         text not null,
  stage                     text not null,
  status                    text not null default 'active',

  -- Always a useful board label, with or without a linked resident — e.g.
  -- "Smith Family Inquiry" for an external prospect with no resident yet.
  display_name              text not null,

  resident_id               uuid references public.residents(id) on delete set null,
  -- References the existing prospects table (website/intake care-seeker
  -- inquiries — see lib/supabase/types.ts Prospect; that table predates
  -- this repo's migration history and has no tracked DDL, but its `id`
  -- column is a stable uuid). Optional provenance link only — a
  -- Relationship is never required to have one, and prospects rows are
  -- never modified by anything in this migration.
  prospect_id                uuid references public.prospects(id) on delete set null,

  community_name             text,
  organization_name          text,

  primary_contact_name         text,
  primary_contact_relationship text,
  primary_contact_phone        text,
  primary_contact_email        text,

  -- The person who may become a resident, when known but not yet linked
  -- (e.g. "Margaret Smith" while her daughter Jennifer is the primary
  -- contact and no resident record exists yet).
  prospective_resident_name  text,

  summary                    text,

  owner_label                text,

  priority                   text not null default 'normal',

  source_type                text,
  source_label                text,

  last_meaningful_touch_at   timestamptz,

  created_by                 text not null,
  created_at                 timestamptz not null default now(),
  updated_by                 text,
  updated_at                 timestamptz not null default now(),

  closed_at                  timestamptz,
  closed_by                  text,

  constraint relationships_type_check
    check (relationship_type in (
      'resident_prospect', 'external_prospect', 'active_client', 'former_client',
      'referral_source', 'community_partner', 'professional_contact', 'other'
    )),

  constraint relationships_stage_check
    check (stage in (
      'new_inquiry', 'contact_attempted', 'connected', 'discovery',
      'assessment_scheduled', 'assessment_completed', 'proposal_in_progress',
      'proposal_sent', 'considering', 'follow_up_needed', 'ready_to_start',
      'won', 'on_hold', 'closed_lost'
    )),

  constraint relationships_status_check
    check (status in ('active', 'on_hold', 'closed')),

  constraint relationships_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),

  constraint relationships_display_name_not_blank
    check (length(trim(display_name)) > 0),

  -- Part 20: closed relationships must never look active because of a
  -- forgotten field — status='closed' and closed_at are always set
  -- together, enforced here rather than trusted to application code.
  constraint relationships_closed_consistency_check
    check ((status = 'closed') = (closed_at is not null))
);

create index if not exists relationships_type_idx on relationships (relationship_type);
create index if not exists relationships_stage_idx on relationships (stage);
create index if not exists relationships_owner_idx on relationships (owner_label);
create index if not exists relationships_resident_idx on relationships (resident_id);
create index if not exists relationships_status_idx on relationships (status);
create index if not exists relationships_last_touch_idx on relationships (last_meaningful_touch_at);
create index if not exists relationships_updated_idx on relationships (updated_at desc);

-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this
-- app. Server actions are the access-control boundary (they validate an
-- authorized staff session via getCurrentAuthorizedUser() before calling
-- any data-layer function; client-supplied ids are never trusted as
-- proof of access on their own).
alter table relationships enable row level security;

-- Append-only: one row per actual stage change. No row for a no-op save,
-- no row is ever updated or deleted by the app.
create table if not exists relationship_stage_history (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships(id) on delete cascade,
  from_stage       text,
  to_stage         text not null,
  change_reason    text,
  changed_by       text not null,
  changed_at       timestamptz not null default now()
);

create index if not exists relationship_stage_history_relationship_idx
  on relationship_stage_history (relationship_id, changed_at desc);

alter table relationship_stage_history enable row level security;

-- Relationship Timeline: the chronological, factual, append-only history
-- of a Relationship — deliberately separate from resident_timeline (see
-- 20260716010000_create_resident_timeline.sql) because an external
-- prospect may have no resident_id at all. Not cross-linked into
-- resident_timeline automatically in this phase — see
-- docs/design/RELATIONSHIPS.md, "Future cross-linking question".
create table if not exists relationship_timeline (
  id                 uuid primary key default gen_random_uuid(),
  relationship_id    uuid not null references public.relationships(id) on delete cascade,
  event_type         text not null,
  event_title        text not null,
  event_description  text,
  source_type        text not null,
  source_record_id   uuid,
  system_generated   boolean not null default true,
  created_by         text,
  created_at         timestamptz not null default now(),

  constraint relationship_timeline_event_type_check
    check (event_type in (
      'relationship_created', 'resident_linked', 'stage_changed', 'touch_logged',
      'action_created', 'action_updated', 'action_completed', 'action_dismissed',
      'relationship_won', 'relationship_on_hold', 'relationship_closed',
      'working_note_created', 'working_note_resolved'
    )),

  constraint relationship_timeline_event_title_not_blank
    check (length(trim(event_title)) > 0)
);

create index if not exists relationship_timeline_relationship_idx
  on relationship_timeline (relationship_id, created_at desc);

alter table relationship_timeline enable row level security;

create or replace function relationships_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on relationships;
create trigger set_updated_at
  before update on relationships
  for each row execute function relationships_set_updated_at();

-- Atomic create: inserts the relationship, its initial stage-history row
-- (from_stage null — this is the one case a history row is written
-- without an actual "change"), and a relationship_created Timeline event.
create or replace function create_relationship(
  p_relationship_type text,
  p_stage text,
  p_display_name text,
  p_resident_id uuid,
  p_prospect_id uuid,
  p_community_name text,
  p_organization_name text,
  p_primary_contact_name text,
  p_primary_contact_relationship text,
  p_primary_contact_phone text,
  p_primary_contact_email text,
  p_prospective_resident_name text,
  p_summary text,
  p_owner_label text,
  p_priority text,
  p_source_type text,
  p_source_label text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to create a relationship';
  end if;

  if length(trim(p_display_name)) = 0 then
    raise exception 'Relationship display name cannot be blank';
  end if;

  insert into relationships (
    relationship_type, stage, display_name, resident_id, prospect_id,
    community_name, organization_name,
    primary_contact_name, primary_contact_relationship, primary_contact_phone, primary_contact_email,
    prospective_resident_name, summary, owner_label,
    priority, source_type, source_label, created_by
  ) values (
    p_relationship_type, p_stage, p_display_name, p_resident_id, p_prospect_id,
    p_community_name, p_organization_name,
    p_primary_contact_name, p_primary_contact_relationship, p_primary_contact_phone, p_primary_contact_email,
    p_prospective_resident_name, p_summary, p_owner_label,
    coalesce(p_priority, 'normal'), p_source_type, p_source_label, p_actor
  )
  returning id into v_id;

  insert into relationship_stage_history (relationship_id, from_stage, to_stage, changed_by)
  values (v_id, null, p_stage, p_actor);

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    v_id, 'relationship_created', p_display_name || ' created.',
    case when p_resident_id is not null then 'Linked to resident at creation.' else null end,
    'relationships', p_actor, true
  );

  return v_id;
end;
$$;

revoke execute on function create_relationship(
  text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function create_relationship(
  text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

-- Atomic stage change: no-ops if the stage is unchanged, otherwise writes
-- one stage_history row, updates relationships.stage (deriving `status`/
-- `closed_at`/`closed_by` from the new stage — won/closed_lost close the
-- relationship, on_hold pauses it, anything else reactivates it), and
-- logs one Timeline event.
create or replace function change_relationship_stage(
  p_relationship_id uuid,
  p_to_stage text,
  p_change_reason text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_current relationships%rowtype;
  v_status text;
  v_event_type text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to change a relationship stage';
  end if;

  select * into v_current from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  if v_current.stage = p_to_stage then
    return;
  end if;

  insert into relationship_stage_history (relationship_id, from_stage, to_stage, change_reason, changed_by)
  values (p_relationship_id, v_current.stage, p_to_stage, p_change_reason, p_actor);

  v_status := case
    when p_to_stage in ('won', 'closed_lost') then 'closed'
    when p_to_stage = 'on_hold' then 'on_hold'
    else 'active'
  end;

  update relationships
  set stage = p_to_stage,
      status = v_status,
      closed_at = case when v_status = 'closed' then now() else null end,
      closed_by = case when v_status = 'closed' then p_actor else null end,
      updated_by = p_actor
  where id = p_relationship_id;

  v_event_type := case
    when p_to_stage = 'won' then 'relationship_won'
    when p_to_stage = 'on_hold' then 'relationship_on_hold'
    when p_to_stage = 'closed_lost' then 'relationship_closed'
    else 'stage_changed'
  end;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, v_event_type,
    v_current.display_name || ' stage changed.',
    'Stage changed from ' || v_current.stage || ' to ' || p_to_stage || '.' ||
      case when p_change_reason is not null then ' ' || p_change_reason else '' end,
    'relationships', p_actor, true
  );
end;
$$;

revoke execute on function change_relationship_stage(uuid, text, text, text) from public;
grant execute on function change_relationship_stage(uuid, text, text, text) to service_role;

-- Links (or re-links) a Relationship to a resident without ever touching
-- its history — the Relationship keeps its own id, stage history,
-- touches, actions, working notes, and Timeline exactly as they were.
-- No-ops if already linked to the same resident. Raises if linked to a
-- *different* resident and p_force is false, so the app layer can prompt
-- for explicit confirmation before overwriting an existing link.
create or replace function link_relationship_to_resident(
  p_relationship_id uuid,
  p_resident_id uuid,
  p_actor text,
  p_force boolean default false
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_current_resident_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to link a relationship to a resident';
  end if;

  select resident_id into v_current_resident_id
  from relationships
  where id = p_relationship_id
  for update;

  if not found then
    raise exception 'Relationship not found';
  end if;

  if not exists (select 1 from residents where id = p_resident_id) then
    raise exception 'Resident not found';
  end if;

  if v_current_resident_id = p_resident_id then
    return;
  end if;

  if v_current_resident_id is not null and not p_force then
    raise exception 'RELATIONSHIP_ALREADY_LINKED';
  end if;

  update relationships
  set resident_id = p_resident_id,
      updated_by = p_actor
  where id = p_relationship_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, 'resident_linked', 'Linked to resident.',
    null, 'relationships', p_actor, true
  );
end;
$$;

revoke execute on function link_relationship_to_resident(uuid, uuid, text, boolean) from public;
grant execute on function link_relationship_to_resident(uuid, uuid, text, boolean) to service_role;

commit;
