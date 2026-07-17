begin;

-- Relationship Touches: a meaningful, human-initiated interaction — "what
-- happened between Serve and this person/family?" Distinct from
-- resident_touches (20260711000000_create_resident_connections.sql),
-- which is resident-scoped, has no working write path anywhere in the
-- app today, and — per docs/design/RESIDENT_MEMORY.md — was deliberately
-- left out of the Getting to Know UI because its concept already belongs
-- to Timeline. Relationship Touches is the real, actively-written
-- version of that same idea, scoped to a Relationship (which may have no
-- resident_id at all).
create table if not exists relationship_touches (
  id                 uuid primary key default gen_random_uuid(),
  relationship_id    uuid not null references public.relationships(id) on delete cascade,

  touch_type         text not null,
  occurred_at        timestamptz not null default now(),
  summary            text not null,
  outcome            text,
  contact_name       text,

  created_by         text not null,
  created_at         timestamptz not null default now(),

  -- Polymorphic provenance, same pattern as resident_wellness_follow_ups.
  -- source_record_id has no FK for the same reason (may point at a
  -- record in any of several tables).
  source_type        text not null default 'manual',
  source_record_id   uuid,

  constraint relationship_touches_type_check
    check (touch_type in (
      'call', 'email', 'text', 'meeting', 'assessment', 'resident_visit', 'proposal', 'other'
    )),

  constraint relationship_touches_summary_not_blank
    check (length(trim(summary)) > 0)
);

create index if not exists relationship_touches_relationship_idx
  on relationship_touches (relationship_id, occurred_at desc);

alter table relationship_touches enable row level security;

-- Atomic: inserts the touch, advances last_meaningful_touch_at (never
-- backward — a backdated touch entry never regresses the "last touch"
-- clock past a more recent one already on record), and logs exactly one
-- Timeline event. Nothing else in this app updates
-- relationships.last_meaningful_touch_at — internal edits are never
-- mistaken for meaningful contact.
create or replace function log_relationship_touch(
  p_relationship_id uuid,
  p_touch_type text,
  p_occurred_at timestamptz,
  p_summary text,
  p_outcome text,
  p_contact_name text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_touch_id uuid;
  v_display_name text;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to log a touch';
  end if;

  if length(trim(p_summary)) = 0 then
    raise exception 'Describe what happened in this touch';
  end if;

  select display_name into v_display_name from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  insert into relationship_touches (
    relationship_id, touch_type, occurred_at, summary, outcome, contact_name, created_by
  ) values (
    p_relationship_id, p_touch_type, v_occurred_at, p_summary, p_outcome, p_contact_name, p_actor
  )
  returning id into v_touch_id;

  update relationships
  set last_meaningful_touch_at = greatest(coalesce(last_meaningful_touch_at, v_occurred_at), v_occurred_at),
      updated_by = p_actor
  where id = p_relationship_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'touch_logged', v_display_name || ': ' || initcap(p_touch_type) || ' logged.',
    p_summary, 'relationship_touches', v_touch_id, p_actor, true
  );

  return v_touch_id;
end;
$$;

revoke execute on function log_relationship_touch(
  uuid, text, timestamptz, text, text, text, text
) from public;
grant execute on function log_relationship_touch(
  uuid, text, timestamptz, text, text, text, text
) to service_role;

commit;
