begin;

-- Resident Working Notes: the second resident-memory layer — "what is
-- currently in motion?" Temporary operational thoughts, expected to change.
-- Distinct from Current Needs (a curated, single-active-version summary of
-- how to care for the resident) and from Timeline (a factual, system-
-- generated log of what happened) — see resident_current_needs and
-- resident_timeline. Working Notes are append-only: resolving or archiving
-- a note updates its own row (status/resolved_at/resolved_by/archived_at),
-- it never gets superseded by a new row and never gets deleted.
--
-- Staff-identity note: created_by / resolved_by / updated_by are `text`,
-- matching the convention already established for resident_current_needs
-- and resident_wellness_follow_ups (this app's only staff-identity signal
-- is the email/full_name pair from getCurrentAuthorizedUser()).
--
-- `status` and `resolved` are both present per the phase-1 field list, but
-- are never allowed to drift apart: the check constraint below enforces
-- resolved = (status <> 'open'), so `resolved` is a genuinely redundant,
-- always-consistent convenience flag rather than a second source of truth.

create table if not exists resident_working_notes (
  id             uuid primary key default gen_random_uuid(),

  resident_id    uuid not null
                 references public.residents(id) on delete cascade,

  content        text not null,
  category       text,

  status         text not null default 'open',
  resolved       boolean not null default false,
  resolved_at    timestamptz,
  resolved_by    text,

  archived_at    timestamptz,

  created_at     timestamptz not null default now(),
  created_by     text not null,

  -- Edit is explicitly out of scope for this phase (see AGENTS.md) — these
  -- columns exist now so a later phase can add editing without a schema
  -- change, but nothing in this migration or the app writes to them yet.
  updated_at     timestamptz,
  updated_by     text,

  constraint resident_working_notes_content_not_blank
    check (length(trim(content)) > 0),

  constraint resident_working_notes_content_length_check
    check (length(content) <= 1000),

  constraint resident_working_notes_status_check
    check (status in ('open', 'resolved', 'archived')),

  constraint resident_working_notes_category_check
    check (category is null or category in (
      'operational', 'family', 'scheduling', 'sales', 'clinical', 'general'
    )),

  constraint resident_working_notes_resolved_consistency_check
    check (
      (status = 'open' and resolved = false)
      or
      (status in ('resolved', 'archived') and resolved = true)
    ),

  constraint resident_working_notes_resolved_fields_check
    check (resolved = (resolved_at is not null and resolved_by is not null)),

  constraint resident_working_notes_archived_fields_check
    check (status = 'archived' or archived_at is null)
);

create index if not exists resident_working_notes_resident_status_idx
  on resident_working_notes (resident_id, status, created_at desc);

-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this
-- subsystem.
alter table resident_working_notes enable row level security;

-- Create: inserts the note and its "working note added" timeline event in
-- one transaction, so the two can never fall out of sync.
create or replace function create_resident_working_note(
  p_resident_id uuid,
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

  insert into resident_working_notes (
    resident_id, content, category, created_by
  ) values (
    p_resident_id, p_content, p_category, p_actor
  )
  returning id into v_note_id;

  insert into resident_timeline (
    resident_id, event_type, event_title, event_description, source, created_by, system_generated
  ) values (
    p_resident_id,
    'working_note_created',
    'Working note added',
    case
      when p_category is not null then initcap(p_category) || ' working note added.'
      else 'A working note was added.'
    end,
    'resident_working_notes',
    p_actor,
    true
  );

  return v_note_id;
end;
$$;

revoke execute on function create_resident_working_note(uuid, text, text, text) from public;
grant execute on function create_resident_working_note(uuid, text, text, text) to service_role;

-- Resolve: open -> resolved. Logs the "working note resolved" timeline
-- event only on the transition that actually happens (idempotent — calling
-- this twice on an already-resolved note does not double-log).
create or replace function resolve_resident_working_note(
  p_working_note_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_resident_id uuid;
  v_status text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve a working note';
  end if;

  select resident_id, status into v_resident_id, v_status
  from resident_working_notes
  where id = p_working_note_id
  for update;

  if not found then
    raise exception 'Working note not found';
  end if;

  if v_status <> 'open' then
    return;
  end if;

  update resident_working_notes
  set status = 'resolved',
      resolved = true,
      resolved_at = now(),
      resolved_by = p_actor
  where id = p_working_note_id;

  insert into resident_timeline (
    resident_id, event_type, event_title, event_description, source, created_by, system_generated
  ) values (
    v_resident_id,
    'working_note_resolved',
    'Working note resolved',
    'A working note was marked resolved.',
    'resident_working_notes',
    p_actor,
    true
  );
end;
$$;

revoke execute on function resolve_resident_working_note(uuid, text) from public;
grant execute on function resolve_resident_working_note(uuid, text) to service_role;

-- Archive: open or resolved -> archived. No timeline event — archiving is
-- a visibility change ("stop showing this"), not an event that happened to
-- the resident, and isn't one of the four triggers this phase specifies.
-- If the note was never resolved, archiving also closes it out (resolved
-- fields are set here so the consistency check above holds); if it was
-- already resolved, its existing resolved_at/resolved_by are preserved.
create or replace function archive_resident_working_note(
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
  from resident_working_notes
  where id = p_working_note_id
  for update;

  if not found then
    raise exception 'Working note not found';
  end if;

  if v_status = 'archived' then
    return;
  end if;

  update resident_working_notes
  set status = 'archived',
      resolved = true,
      resolved_at = coalesce(resolved_at, now()),
      resolved_by = coalesce(resolved_by, p_actor),
      archived_at = now()
  where id = p_working_note_id;
end;
$$;

revoke execute on function archive_resident_working_note(uuid, text) from public;
grant execute on function archive_resident_working_note(uuid, text) to service_role;

commit;
