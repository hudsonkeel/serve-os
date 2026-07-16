begin;

-- Resident Timeline: the third resident-memory layer — "what has happened?"
-- Chronological, factual, append-only, and (in this phase) entirely system
-- generated. There is no manual-entry path; every row here is written by a
-- database trigger or by another subsystem's own atomic RPC in the same
-- transaction as the event it's describing, so the timeline can never miss
-- an event or record a duplicate for one.
--
-- system_generated is carried as an explicit column (rather than assumed)
-- so a later phase can add staff-authored manual entries without a schema
-- change — see AGENTS.md, "Do NOT build manual Timeline entry" (this phase).

create table if not exists resident_timeline (
  id                 uuid primary key default gen_random_uuid(),

  resident_id        uuid not null
                      references public.residents(id) on delete cascade,

  event_type         text not null,
  event_title        text not null,
  event_description  text,

  -- Originating table/subsystem, e.g. 'residents', 'resident_current_needs',
  -- 'resident_working_notes' — not a user-facing label.
  source             text not null,

  created_at         timestamptz not null default now(),
  created_by         text,

  system_generated   boolean not null default true,

  constraint resident_timeline_event_type_check
    check (event_type in (
      'resident_created',
      'current_needs_updated',
      'working_note_created',
      'working_note_resolved'
    )),

  constraint resident_timeline_event_title_not_blank
    check (length(trim(event_title)) > 0)
);

create index if not exists resident_timeline_resident_created_idx
  on resident_timeline (resident_id, created_at desc);

-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this
-- subsystem. There is no update/delete path at all (append-only by
-- construction, not just by convention).
alter table resident_timeline enable row level security;

-- "Resident created" is the one timeline event this phase can't generate
-- from inside an app-owned RPC: residents are written by import/sync
-- pipelines outside this Next.js app (and potentially outside this repo
-- entirely) as well as by any future in-app creation flow. A trigger is the
-- only place that reliably sees every insert path. It has no staff-session
-- context, so created_by is left null for this one event type.
create or replace function resident_timeline_log_resident_created()
returns trigger as $$
begin
  insert into resident_timeline (
    resident_id,
    event_type,
    event_title,
    event_description,
    source,
    system_generated
  ) values (
    new.id,
    'resident_created',
    'Resident created',
    case
      when new.source_system is not null
        then 'Imported from ' || initcap(replace(new.source_system, '_', ' '))
      else 'Added to Serve OS'
    end,
    'residents',
    true
  );
  return new;
end;
$$ language plpgsql
set search_path = public;

drop trigger if exists log_resident_created on residents;
create trigger log_resident_created
  after insert on residents
  for each row execute function resident_timeline_log_resident_created();

-- Backfill: residents imported before this migration existed would
-- otherwise show an empty timeline forever for an event that already
-- happened. One-time, idempotent (guarded by not exists) — safe to leave
-- in a future replay of this migration.
insert into resident_timeline (
  resident_id, event_type, event_title, event_description, source, system_generated, created_at
)
select
  r.id,
  'resident_created',
  'Resident created',
  case
    when r.source_system is not null
      then 'Imported from ' || initcap(replace(r.source_system, '_', ' '))
    else 'Added to Serve OS'
  end,
  'residents',
  true,
  r.created_at
from residents r
where not exists (
  select 1 from resident_timeline t
  where t.resident_id = r.id and t.event_type = 'resident_created'
);

commit;
