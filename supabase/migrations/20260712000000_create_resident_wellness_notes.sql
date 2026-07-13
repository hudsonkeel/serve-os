-- Resident Wellness Notes: a time-based operational observation timeline,
-- distinct from Connections (relationship memory) and resident_touches
-- (relationship outreach). Populated manually by Serve staff today, with a
-- source_system column that leaves room for future Cinch CCM / AxisCare
-- imports without conflating them with Serve-originated entries.
--
-- public.residents remains the canonical resident identity table — this
-- table stores no identity fields and references public.residents(id) only.
--
-- A wellness note represents one operational event. One event may affect
-- multiple wellness domains, so classification lives in a separate
-- resident_wellness_note_signals table (many signals per note) rather than
-- a single required note_type column. primary_domain remains as an
-- optional, coarse label — it is never the sole classification.

create table if not exists resident_wellness_notes (
  id                  uuid primary key default gen_random_uuid(),

  resident_id         uuid not null
                       references public.residents(id) on delete cascade,

  observed_at         timestamptz not null default now(),

  primary_domain      text,
  observation         text not null,
  context             text,
  action_taken        text,

  follow_up_required  boolean not null default false,
  follow_up_date      date,

  priority            text not null default 'routine',

  source_system       text not null default 'serve_os',
  source_record_id    text,
  entered_by          text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint resident_wellness_notes_primary_domain_check
    check (primary_domain is null or primary_domain in (
      'general_wellness',
      'mobility',
      'fall_risk',
      'medication',
      'nutrition_hydration',
      'mood_behavior',
      'cognition',
      'sleep',
      'personal_care',
      'environment_safety',
      'social_engagement',
      'family_update',
      'hospital_rehab',
      'other'
    )),

  constraint resident_wellness_notes_priority_check
    check (priority in ('routine', 'monitor', 'important', 'urgent')),

  constraint resident_wellness_notes_source_system_check
    check (source_system in (
      'serve_os',
      'cinch_ccm',
      'axiscare',
      'assessment',
      'family',
      'community_staff',
      'other'
    )),

  constraint resident_wellness_notes_follow_up_date_check
    check (not follow_up_required or follow_up_date is not null)
);

create index if not exists resident_wellness_notes_resident_observed_idx
  on resident_wellness_notes (resident_id, observed_at desc);

create index if not exists resident_wellness_notes_follow_up_idx
  on resident_wellness_notes (follow_up_required, follow_up_date)
  where follow_up_required = true;

create index if not exists resident_wellness_notes_source_idx
  on resident_wellness_notes (source_system, source_record_id);

-- Scoped updated_at trigger (mirrors the pattern used for the Connections
-- tables in 20260711000000_create_resident_connections.sql — no shared
-- trigger convention exists in this repo, so each migration defines its own).
create or replace function resident_wellness_notes_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on resident_wellness_notes;
create trigger set_updated_at
  before update on resident_wellness_notes
  for each row execute function resident_wellness_notes_set_updated_at();

-- RLS: service role bypasses this automatically (server actions and data
-- access run through createServerClient(), which uses the service role
-- key). No policies are defined, so the anon key has zero access — matches
-- the recruiting_leads / resident_connections convention.
alter table resident_wellness_notes enable row level security;

-- Wellness signals: many structured signals per wellness note. A single
-- operational event (e.g. a fall) commonly touches several domains at once
-- (mobility + fall_risk + injury + bathroom_safety), so this is a proper
-- one-to-many join table rather than a repeated single-select column.

create table if not exists resident_wellness_note_signals (
  id                 uuid primary key default gen_random_uuid(),

  wellness_note_id   uuid not null
                     references public.resident_wellness_notes(id) on delete cascade,

  signal_type        text not null,

  created_at         timestamptz not null default now(),

  constraint resident_wellness_note_signals_signal_type_check
    check (signal_type in (
      'general_wellness',
      'mobility',
      'fall_risk',
      'injury',
      'pain',
      'medication',
      'nutrition_hydration',
      'cognition',
      'mood_behavior',
      'sleep',
      'personal_care',
      'continence',
      'sensory_change',
      'hospital_rehab',
      'surgery_procedure',
      'return_from_rehab',
      'change_in_service_need',
      'environment_safety',
      'bathroom_safety',
      'equipment',
      'home_modification',
      'accessibility',
      'social_engagement',
      'isolation',
      'family_update',
      'resident_preference',
      'care_resistance',
      'missed_task',
      'caregiver_concern',
      'follow_up_needed',
      'other'
    )),

  constraint resident_wellness_note_signals_unique
    unique (wellness_note_id, signal_type)
);

create index if not exists resident_wellness_note_signals_note_idx
  on resident_wellness_note_signals (wellness_note_id);

create index if not exists resident_wellness_note_signals_type_idx
  on resident_wellness_note_signals (signal_type);

alter table resident_wellness_note_signals enable row level security;

-- Atomic insert: one wellness note + its signals in a single server-side
-- call, so the app-level data layer never has to coordinate a "insert note,
-- then insert signals" sequence across two separate round trips. Runs with
-- the caller's own privileges (no SECURITY DEFINER) — the only caller is the
-- service-role Supabase client, which already bypasses RLS on both tables;
-- an anon/authenticated caller would still be blocked by RLS on the insert
-- into resident_wellness_notes itself.
create or replace function create_resident_wellness_note(
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
  p_signal_types text[]
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_note_id uuid;
  v_distinct_signals text[];
  v_signal text;
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

  return v_note_id;
end;
$$;

-- Match the service-role-only convention at the function-privilege level too,
-- not just via RLS: only service_role may execute this RPC.
revoke execute on function create_resident_wellness_note(
  uuid, timestamptz, text, text, text, text, boolean, date, text, text, text, text, text[]
) from public;

grant execute on function create_resident_wellness_note(
  uuid, timestamptz, text, text, text, text, boolean, date, text, text, text, text, text[]
) to service_role;
