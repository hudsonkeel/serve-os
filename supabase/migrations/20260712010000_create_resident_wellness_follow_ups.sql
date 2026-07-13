-- Resident Wellness Follow-Ups: the "what should happen next" layer of the
-- Resident Wellness subsystem. A follow-up is a separate, trackable
-- operational object — never free text embedded permanently inside a
-- wellness observation. One observation may create zero, one, or many
-- follow-ups; the observation itself remains an immutable historical event.
--
-- Staff-identity note: assigned_to / created_by / completed_by / dismissed_by
-- are stored as `text` rather than `uuid`. The repo's only working staff-
-- identity convention today is the email/full_name pair surfaced by
-- getCurrentAuthorizedUser() (see resident_wellness_notes.entered_by, added
-- in 20260712000000). user_profiles is keyed by email and exposes no uuid to
-- the app, and extending auth to expose one is out of scope here. Using
-- `text` matches the convention this subsystem already ships with, rather
-- than adding uuid columns that could never be populated without touching
-- authentication.

create table if not exists resident_wellness_follow_ups (
  id                  uuid primary key default gen_random_uuid(),

  resident_id         uuid not null
                       references public.residents(id) on delete cascade,

  -- Deliberately no FK on source_id: this table is designed for future
  -- polymorphic sources (assessments, service plans, imported notes, system
  -- rules) that may not all be backed by a single table.
  source_type         text not null default 'manual',
  source_id           uuid,

  title               text not null,
  description         text,

  follow_up_type      text not null,

  due_at              timestamptz,

  assigned_to         text,

  priority            text not null default 'routine',
  status              text not null default 'open',

  suggested_by        text not null default 'manual',
  suggestion_rule_id  text,

  created_by          text,

  completed_at        timestamptz,
  completed_by        text,
  completion_note     text,

  dismissed_at        timestamptz,
  dismissed_by        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint resident_wellness_follow_ups_source_type_check
    check (source_type in (
      'wellness_observation',
      'assessment',
      'current_status',
      'service_plan',
      'imported_note',
      'manual',
      'system_rule'
    )),

  -- Only wellness_observation and manual are actively used in this scope,
  -- but the fuller set is accepted now so future sources don't need another
  -- constraint migration.
  constraint resident_wellness_follow_ups_follow_up_type_check
    check (follow_up_type in (
      'reassessment',
      'resident_check_in',
      'family_update',
      'safety_review',
      'medication_review',
      'mobility_review',
      'equipment_review',
      'care_coordination',
      'service_review',
      'documentation',
      'other'
    )),

  constraint resident_wellness_follow_ups_priority_check
    check (priority in ('routine', 'monitor', 'important', 'urgent')),

  constraint resident_wellness_follow_ups_status_check
    check (status in ('open', 'in_progress', 'completed', 'dismissed', 'cancelled')),

  constraint resident_wellness_follow_ups_suggested_by_check
    check (suggested_by in ('manual', 'rule_engine')),

  -- A follow-up cannot claim to originate from a wellness observation
  -- without pointing at one. The atomic RPC below always supplies its own
  -- freshly-created observation id for this case, so the invariant "the
  -- source observation exists and belongs to the same resident" holds by
  -- construction rather than needing a runtime lookup.
  constraint resident_wellness_follow_ups_source_id_required_check
    check (source_type <> 'wellness_observation' or source_id is not null)
);

-- "Overdue" is intentionally not a stored status — it is derived wherever
-- follow-ups are read: status in ('open', 'in_progress') and due_at < now().

create index if not exists resident_wellness_follow_ups_resident_status_due_idx
  on resident_wellness_follow_ups (resident_id, status, due_at);

create index if not exists resident_wellness_follow_ups_assigned_status_due_idx
  on resident_wellness_follow_ups (assigned_to, status, due_at);

create index if not exists resident_wellness_follow_ups_source_idx
  on resident_wellness_follow_ups (source_type, source_id);

create index if not exists resident_wellness_follow_ups_open_due_idx
  on resident_wellness_follow_ups (due_at)
  where status in ('open', 'in_progress');

-- Scoped updated_at trigger, same pattern as Connections and Wellness Notes.
create or replace function resident_wellness_follow_ups_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on resident_wellness_follow_ups;
create trigger set_updated_at
  before update on resident_wellness_follow_ups
  for each row execute function resident_wellness_follow_ups_set_updated_at();

-- RLS: service role bypasses this automatically. No policies are defined,
-- so the anon key has zero access — matches every other table in this
-- subsystem.
alter table resident_wellness_follow_ups enable row level security;

-- Atomic save: observation + signals + accepted follow-ups in one
-- transaction. The already-applied create_resident_wellness_note(...) from
-- 20260712000000 is left untouched and callable (it has a different
-- signature — adding a follow-ups parameter is not a compatible
-- CREATE OR REPLACE target, since Postgres matches functions by their full
-- argument signature; changing it would create a second overload rather
-- than "replace" the original, which is more confusing than a clearly
-- separately named function). The application's data layer now calls this
-- new function exclusively; the old one is dead code left in place rather
-- than dropped, since dropping an applied function is a separate, riskier
-- kind of migration than this task calls for.
create or replace function create_resident_wellness_note_with_follow_ups(
  p_resident_id uuid,
  p_observed_at timestamptz,
  p_primary_domain text,
  p_observation text,
  p_context text,
  p_action_taken text,
  p_follow_up_required boolean,
  p_follow_up_date date,
  p_priority text,
  p_source_system text,
  p_source_record_id text,
  p_entered_by text,
  p_signal_types text[],
  p_follow_ups jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_note_id uuid;
  v_distinct_signals text[];
  v_signal text;
  v_follow_up jsonb;
begin
  select array_agg(distinct s) into v_distinct_signals
  from unnest(coalesce(p_signal_types, array[]::text[])) as s;

  if v_distinct_signals is null or array_length(v_distinct_signals, 1) is null then
    raise exception 'At least one wellness signal is required';
  end if;

  insert into resident_wellness_notes (
    resident_id,
    observed_at,
    primary_domain,
    observation,
    context,
    action_taken,
    follow_up_required,
    follow_up_date,
    priority,
    source_system,
    source_record_id,
    entered_by
  ) values (
    p_resident_id,
    coalesce(p_observed_at, now()),
    p_primary_domain,
    p_observation,
    p_context,
    p_action_taken,
    coalesce(p_follow_up_required, false),
    p_follow_up_date,
    coalesce(p_priority, 'routine'),
    coalesce(p_source_system, 'serve_os'),
    p_source_record_id,
    p_entered_by
  )
  returning id into v_note_id;

  foreach v_signal in array v_distinct_signals
  loop
    insert into resident_wellness_note_signals (wellness_note_id, signal_type)
    values (v_note_id, v_signal);
  end loop;

  if p_follow_ups is not null then
    for v_follow_up in select * from jsonb_array_elements(p_follow_ups)
    loop
      insert into resident_wellness_follow_ups (
        resident_id,
        source_type,
        source_id,
        title,
        description,
        follow_up_type,
        due_at,
        assigned_to,
        priority,
        status,
        suggested_by,
        suggestion_rule_id,
        created_by
      ) values (
        p_resident_id,
        'wellness_observation',
        v_note_id,
        v_follow_up->>'title',
        nullif(v_follow_up->>'description', ''),
        v_follow_up->>'follow_up_type',
        nullif(v_follow_up->>'due_at', '')::timestamptz,
        nullif(v_follow_up->>'assigned_to', ''),
        coalesce(v_follow_up->>'priority', 'routine'),
        'open',
        coalesce(v_follow_up->>'suggested_by', 'manual'),
        nullif(v_follow_up->>'suggestion_rule_id', ''),
        nullif(v_follow_up->>'created_by', '')
      );
    end loop;
  end if;

  return v_note_id;
end;
$$;

-- Same function-privilege convention as create_resident_wellness_note:
-- only service_role may execute this RPC.
revoke execute on function create_resident_wellness_note_with_follow_ups(
  uuid, timestamptz, text, text, text, text, boolean, date, text, text, text, text, text[], jsonb
) from public;

grant execute on function create_resident_wellness_note_with_follow_ups(
  uuid, timestamptz, text, text, text, text, boolean, date, text, text, text, text, text[], jsonb
) to service_role;
