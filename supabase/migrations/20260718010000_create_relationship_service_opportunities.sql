begin;

-- Relationship Service Opportunity — early, nonclinical service-planning
-- information for a prospect-oriented Relationship (see
-- docs/design/RELATIONSHIPS.md, "Service Opportunity"). The digital
-- equivalent of what Brian writes on his physical whiteboard before a
-- proposal exists: a rough visit shape, not a care plan, not an AxisCare
-- schedule, not a Cinch visit. One row per Relationship, edited in place —
-- deliberately no field-level audit table (unlike relationship_actions):
-- this is preliminary, frequently-revised planning context, not
-- accountable next-step history, so one Timeline event per meaningful save
-- is enough context without the overhead of a full diff-audit trail.
create table if not exists relationship_service_opportunities (
  id                          uuid primary key default gen_random_uuid(),
  relationship_id             uuid not null unique references public.relationships(id) on delete cascade,

  service_summary             text,
  visits_per_week             integer,
  preferred_days              text,
  preferred_time_windows      text,
  estimated_visit_minutes     integer,
  anticipated_start_date      date,
  service_location_summary    text,
  status                      text,

  created_by                  text not null,
  created_at                  timestamptz not null default now(),
  updated_by                  text,
  updated_at                  timestamptz not null default now(),

  constraint relationship_service_opportunities_visits_range_check
    check (visits_per_week is null or (visits_per_week >= 0 and visits_per_week <= 21)),

  constraint relationship_service_opportunities_duration_range_check
    check (estimated_visit_minutes is null or (estimated_visit_minutes > 0 and estimated_visit_minutes <= 1440)),

  constraint relationship_service_opportunities_status_check
    check (status is null or status in ('draft', 'ready_for_proposal', 'superseded'))
);

create index if not exists relationship_service_opportunities_relationship_idx
  on relationship_service_opportunities (relationship_id);

alter table relationship_service_opportunities enable row level security;

alter table relationship_timeline drop constraint if exists relationship_timeline_event_type_check;
alter table relationship_timeline add constraint relationship_timeline_event_type_check
  check (event_type in (
    'relationship_created', 'resident_linked', 'stage_changed', 'touch_logged',
    'action_created', 'action_updated', 'action_completed', 'action_dismissed',
    'relationship_won', 'relationship_on_hold', 'relationship_closed',
    'working_note_created', 'working_note_resolved', 'service_opportunity_updated',
    'relationship_updated'
  ));

-- Owner and Priority are simple single-value fields with no accountable
-- next-step semantics (unlike relationship_actions), so this mirrors
-- upsert_relationship_service_opportunity()'s lighter pattern — one
-- Timeline event summarizing what changed, no field-level audit table —
-- rather than relationship_action_edits' full diff-audit machinery.
-- No-ops (no update, no Timeline event) when neither field actually
-- changed, same "never write on a no-op save" rule as every other write
-- in this subsystem.
create or replace function update_relationship_owner_and_priority(
  p_relationship_id uuid,
  p_owner_label text,
  p_priority text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_current relationships%rowtype;
  v_changes text[] := array[]::text[];
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update a relationship';
  end if;

  select * into v_current from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  if v_current.owner_label is distinct from p_owner_label then
    v_changes := array_append(
      v_changes,
      case when p_owner_label is not null then 'Owner changed to ' || p_owner_label || '.' else 'Owner cleared.' end
    );
  end if;

  if v_current.priority is distinct from p_priority then
    v_changes := array_append(v_changes, 'Priority changed to ' || p_priority || '.');
  end if;

  if array_length(v_changes, 1) is null then
    return;
  end if;

  update relationships
  set owner_label = p_owner_label,
      priority = coalesce(p_priority, priority),
      updated_by = p_actor
  where id = p_relationship_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, 'relationship_updated', v_current.display_name || ' updated.',
    array_to_string(v_changes, ' '), 'relationships', p_actor, true
  );
end;
$$;

revoke execute on function update_relationship_owner_and_priority(uuid, text, text, text) from public;
grant execute on function update_relationship_owner_and_priority(uuid, text, text, text) to service_role;

create or replace function relationship_service_opportunities_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on relationship_service_opportunities;
create trigger set_updated_at
  before update on relationship_service_opportunities
  for each row execute function relationship_service_opportunities_set_updated_at();

-- Atomic upsert: creates the one row for this Relationship if it doesn't
-- exist yet, otherwise diffs against the current row and only writes +
-- logs a Timeline event when something actually changed (same no-op-safe
-- principle as update_relationship_action(), just without a field-level
-- audit table).
create or replace function upsert_relationship_service_opportunity(
  p_relationship_id uuid,
  p_service_summary text,
  p_visits_per_week integer,
  p_preferred_days text,
  p_preferred_time_windows text,
  p_estimated_visit_minutes integer,
  p_anticipated_start_date date,
  p_service_location_summary text,
  p_status text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current relationship_service_opportunities%rowtype;
  v_id uuid;
  v_changed boolean := false;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to save a service opportunity';
  end if;

  if not exists (select 1 from relationships where id = p_relationship_id) then
    raise exception 'Relationship not found';
  end if;

  select * into v_current
  from relationship_service_opportunities
  where relationship_id = p_relationship_id
  for update;

  if not found then
    insert into relationship_service_opportunities (
      relationship_id, service_summary, visits_per_week, preferred_days,
      preferred_time_windows, estimated_visit_minutes, anticipated_start_date,
      service_location_summary, status, created_by
    ) values (
      p_relationship_id, p_service_summary, p_visits_per_week, p_preferred_days,
      p_preferred_time_windows, p_estimated_visit_minutes, p_anticipated_start_date,
      p_service_location_summary, p_status, p_actor
    )
    returning id into v_id;

    insert into relationship_timeline (
      relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
    ) values (
      p_relationship_id, 'service_opportunity_updated', 'Service opportunity added.',
      p_service_summary, 'relationship_service_opportunities', v_id, p_actor, true
    );

    return v_id;
  end if;

  v_changed :=
    v_current.service_summary is distinct from p_service_summary or
    v_current.visits_per_week is distinct from p_visits_per_week or
    v_current.preferred_days is distinct from p_preferred_days or
    v_current.preferred_time_windows is distinct from p_preferred_time_windows or
    v_current.estimated_visit_minutes is distinct from p_estimated_visit_minutes or
    v_current.anticipated_start_date is distinct from p_anticipated_start_date or
    v_current.service_location_summary is distinct from p_service_location_summary or
    v_current.status is distinct from p_status;

  if not v_changed then
    return v_current.id;
  end if;

  update relationship_service_opportunities
  set service_summary = p_service_summary,
      visits_per_week = p_visits_per_week,
      preferred_days = p_preferred_days,
      preferred_time_windows = p_preferred_time_windows,
      estimated_visit_minutes = p_estimated_visit_minutes,
      anticipated_start_date = p_anticipated_start_date,
      service_location_summary = p_service_location_summary,
      status = p_status,
      updated_by = p_actor
  where id = v_current.id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'service_opportunity_updated', 'Service opportunity updated.',
    p_service_summary, 'relationship_service_opportunities', v_current.id, p_actor, true
  );

  return v_current.id;
end;
$$;

revoke execute on function upsert_relationship_service_opportunity(
  uuid, text, integer, text, text, integer, date, text, text, text
) from public;
grant execute on function upsert_relationship_service_opportunity(
  uuid, text, integer, text, text, integer, date, text, text, text
) to service_role;

commit;
