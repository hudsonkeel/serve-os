begin;

-- Relationship Working Notes — the same lifecycle/UX pattern as Resident
-- Working Notes (20260716020000_create_resident_working_notes.sql:
-- append-only, resolve/archive update the row in place, no delete), just
-- scoped to a Relationship instead of a resident so external prospects
-- (no resident_id) can have working context too. Deliberately a separate
-- table rather than making resident_working_notes.resident_id nullable —
-- that would let a note exist with neither a resident nor a relationship,
-- weakening an invariant Resident Memory currently relies on, and When a
-- Relationship is later linked to a resident, its notes stay Relationship
-- records (see docs/design/RESIDENT_MEMORY.md's non-duplication
-- principle) — the resident page can read them by joining through
-- relationships.resident_id without them ever being resident_working_notes
-- rows.
create table if not exists relationship_working_notes (
  id              uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,

  content         text not null,
  category        text,

  status          text not null default 'open',
  resolved        boolean not null default false,
  resolved_at     timestamptz,
  resolved_by     text,

  archived_at     timestamptz,

  created_at      timestamptz not null default now(),
  created_by      text not null,

  updated_at      timestamptz,
  updated_by      text,

  constraint relationship_working_notes_content_not_blank
    check (length(trim(content)) > 0),

  constraint relationship_working_notes_content_length_check
    check (length(content) <= 1000),

  constraint relationship_working_notes_status_check
    check (status in ('open', 'resolved', 'archived')),

  constraint relationship_working_notes_category_check
    check (category is null or category in (
      'operational', 'family', 'scheduling', 'sales', 'clinical', 'general'
    )),

  constraint relationship_working_notes_resolved_consistency_check
    check (
      (status = 'open' and resolved = false)
      or
      (status in ('resolved', 'archived') and resolved = true)
    ),

  constraint relationship_working_notes_resolved_fields_check
    check (resolved = (resolved_at is not null and resolved_by is not null)),

  constraint relationship_working_notes_archived_fields_check
    check (status = 'archived' or archived_at is null)
);

create index if not exists relationship_working_notes_relationship_status_idx
  on relationship_working_notes (relationship_id, status, created_at desc);

alter table relationship_working_notes enable row level security;

create or replace function create_relationship_working_note(
  p_relationship_id uuid,
  p_content text,
  p_category text,
  p_actor text
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
    relationship_id, content, category, created_by
  ) values (
    p_relationship_id, p_content, p_category, p_actor
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

revoke execute on function create_relationship_working_note(uuid, text, text, text) from public;
grant execute on function create_relationship_working_note(uuid, text, text, text) to service_role;

create or replace function resolve_relationship_working_note(
  p_working_note_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_relationship_id uuid;
  v_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve a working note';
  end if;

  select relationship_id, status into v_relationship_id, v_status
  from relationship_working_notes
  where id = p_working_note_id
  for update;

  if not found then
    raise exception 'Working note not found';
  end if;

  if v_status <> 'open' then
    return;
  end if;

  update relationship_working_notes
  set status = 'resolved',
      resolved = true,
      resolved_at = now(),
      resolved_by = p_actor
  where id = p_working_note_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    v_relationship_id, 'working_note_resolved', 'Working note resolved.',
    null, 'relationship_working_notes', p_working_note_id, p_actor, true
  );
end;
$$;

revoke execute on function resolve_relationship_working_note(uuid, text) from public;
grant execute on function resolve_relationship_working_note(uuid, text) to service_role;

-- No Timeline event on archive — same rationale as
-- archive_resident_working_note(): archiving is a visibility change, not
-- an event that happened, and isn't one of the two Working-Notes Timeline
-- triggers this phase specifies (create, resolve).
create or replace function archive_relationship_working_note(
  p_working_note_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to archive a working note';
  end if;

  select status into v_status
  from relationship_working_notes
  where id = p_working_note_id
  for update;

  if not found then
    raise exception 'Working note not found';
  end if;

  if v_status = 'archived' then
    return;
  end if;

  update relationship_working_notes
  set status = 'archived',
      resolved = true,
      resolved_at = coalesce(resolved_at, now()),
      resolved_by = coalesce(resolved_by, p_actor),
      archived_at = now()
  where id = p_working_note_id;
end;
$$;

revoke execute on function archive_relationship_working_note(uuid, text) from public;
grant execute on function archive_relationship_working_note(uuid, text) to service_role;

commit;
