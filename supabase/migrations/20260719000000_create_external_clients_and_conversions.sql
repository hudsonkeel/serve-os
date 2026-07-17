begin;

-- External Clients + conversion lifecycle. See docs/design/RELATIONSHIPS.md,
-- "External Clients is the durable workspace for prospective, active,
-- paused, and former clients outside supported communities." An External
-- Client is never a second CRM entity — it is one extra row hanging off an
-- existing `relationships` row (relationship_type = 'active_client',
-- resident_id null) that carries the traditional-home-care-specific fields
-- a Relationship itself has no reason to carry (service address, lifecycle
-- status). All engagement history (actions, touches, working notes,
-- service opportunity, Timeline) stays on the Relationship — reused, never
-- forked.
create table if not exists external_clients (
  id                            uuid primary key default gen_random_uuid(),
  relationship_id               uuid not null unique references public.relationships(id) on delete cascade,

  first_name                    text not null,
  last_name                     text not null,
  preferred_name                text,
  phone                         text,
  email                         text,

  service_address_line_1        text not null,
  service_address_line_2        text,
  city                           text not null,
  state                          text not null,
  postal_code                    text not null,

  primary_contact_name          text,
  primary_contact_relationship  text,
  primary_contact_phone         text,
  primary_contact_email         text,

  service_start_date            date,
  service_end_date              date,
  former_reason                 text,

  status                        text not null default 'active',

  created_by                    text not null,
  created_at                    timestamptz not null default now(),
  updated_by                    text,
  updated_at                    timestamptz not null default now(),

  constraint external_clients_status_check
    check (status in ('active', 'on_hold', 'former')),

  constraint external_clients_first_name_not_blank
    check (length(trim(first_name)) > 0),
  constraint external_clients_last_name_not_blank
    check (length(trim(last_name)) > 0),
  constraint external_clients_address_not_blank
    check (length(trim(service_address_line_1)) > 0),
  constraint external_clients_city_not_blank
    check (length(trim(city)) > 0),
  constraint external_clients_state_not_blank
    check (length(trim(state)) > 0),
  constraint external_clients_postal_code_not_blank
    check (length(trim(postal_code)) > 0)
);

create index if not exists external_clients_status_idx on external_clients (status);

alter table external_clients enable row level security;

create or replace function external_clients_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on external_clients;
create trigger set_updated_at
  before update on external_clients
  for each row execute function external_clients_set_updated_at();

-- Conversion audit — append-only, one row per completed conversion. Never
-- written on a cancelled or failed attempt (every insert below lives inside
-- the same transaction as the conversion it records). Double conversion is
-- rejected by each conversion function's own relationship_type re-check
-- (Part 21), not by a uniqueness constraint here — a Relationship's
-- relationship_type changes as part of converting, so a second attempt's
-- guard clause fails naturally before this table is ever touched twice for
-- the same transition.
create table if not exists relationship_conversions (
  id                      uuid primary key default gen_random_uuid(),
  relationship_id         uuid not null references public.relationships(id) on delete cascade,
  from_relationship_type  text not null,
  to_relationship_type    text not null,
  conversion_path         text not null,
  resident_id             uuid references public.residents(id) on delete set null,
  external_client_id      uuid references public.external_clients(id) on delete set null,
  effective_date          date,
  conversion_note         text,
  converted_by            text not null,
  converted_at            timestamptz not null default now(),

  constraint relationship_conversions_path_check
    check (conversion_path in (
      'resident_prospect_to_active_client',
      'external_prospect_to_external_client',
      'external_prospect_to_new_resident',
      'external_prospect_to_existing_resident'
    ))
);

create index if not exists relationship_conversions_relationship_idx
  on relationship_conversions (relationship_id, converted_at desc);

alter table relationship_conversions enable row level security;

-- ─── Timeline vocabulary ───────────────────────────────────────────────
-- 'relationship_converted': logged by every conversion RPC below, distinct
-- from an ordinary 'stage_changed'/'relationship_won' event — a conversion
-- also changes relationship_type and (for external prospects) creates or
-- links an external_clients/residents row, which is a materially different
-- kind of event worth filtering on independently.
-- 'external_client_status_changed': covers on-hold / reactivate / former —
-- one shared type rather than three, since External Client lifecycle
-- transitions are simple status flips with a description, not the kind of
-- structural change 'relationship_converted' represents.
alter table relationship_timeline drop constraint if exists relationship_timeline_event_type_check;
alter table relationship_timeline add constraint relationship_timeline_event_type_check
  check (event_type in (
    'relationship_created', 'resident_linked', 'stage_changed', 'touch_logged',
    'action_created', 'action_updated', 'action_completed', 'action_dismissed',
    'relationship_won', 'relationship_on_hold', 'relationship_closed',
    'working_note_created', 'working_note_resolved', 'service_opportunity_updated',
    'relationship_updated', 'relationship_converted', 'external_client_status_changed'
  ));

-- Resident Timeline: 'relationship_conversion' is the one new event type
-- this scope adds — logged only when a Resident Prospect Relationship
-- converts to an Active Client (Part 12 #11, "where safely supported" —
-- this constraint edit is what makes it supported). The other two
-- Resident-facing conversion paths (Part 15/16) generate their own
-- Resident Timeline coverage for free: Part 15 inserts a new `residents`
-- row, which the existing resident_timeline_log_resident_created trigger
-- already logs as 'resident_created'; Part 16 links to an *existing*
-- Resident without the scope calling for a distinct Resident Timeline
-- event, so none is added.
alter table resident_timeline drop constraint if exists resident_timeline_event_type_check;
alter table resident_timeline add constraint resident_timeline_event_type_check
  check (event_type in (
    'resident_created',
    'current_needs_updated',
    'working_note_created',
    'working_note_resolved',
    'follow_up_updated',
    'relationship_conversion'
  ));

-- ─── Fix: 'won' must not be a terminal status (Part 19) ─────────────────
-- Before this scope, change_relationship_stage() treated stage = 'won' the
-- same as 'closed_lost' — both set status = 'closed'. That was correct
-- while 'won' had no real downstream meaning, but Part 19 requires an
-- active_client Relationship reaching 'won' to stay visible in ongoing
-- operational views (Action Board, Whiteboard, attention counts) rather
-- than disappearing into "closed." Only 'closed_lost' — an actual sales
-- outcome that ends the relationship — sets status = 'closed' now.
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
    when p_to_stage = 'closed_lost' then 'closed'
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

-- ─── Shared open-action disposition helper ──────────────────────────────
-- Applies one blanket disposition to every currently-open action on a
-- Relationship as part of a conversion or lifecycle transition (Part 12,
-- 14, 17: "handling of open sales actions" / "open actions handled
-- explicitly"). 'keep_open' (or any other value) is a deliberate no-op —
-- conversions must never silently resolve open work (Part 12: "Do not
-- silently resolve all open work"). Logs one summary Timeline event only
-- if it actually touched at least one row.
create or replace function resolve_relationship_open_actions(
  p_relationship_id uuid,
  p_disposition text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_disposition = 'complete' then
    update relationship_actions
    set status = 'completed',
        completed_at = now(),
        completed_by = p_actor,
        completion_outcome = coalesce(completion_outcome, 'Resolved as part of conversion.')
    where relationship_id = p_relationship_id and status = 'open';
    get diagnostics v_count = row_count;

    if v_count > 0 then
      insert into relationship_timeline (
        relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
      ) values (
        p_relationship_id, 'action_completed',
        v_count || ' open action' || case when v_count = 1 then '' else 's' end || ' completed.',
        'Resolved as part of conversion.', 'relationship_actions', p_actor, true
      );
    end if;

  elsif p_disposition = 'dismiss' then
    update relationship_actions
    set status = 'dismissed',
        dismissed_at = now(),
        dismissed_by = p_actor
    where relationship_id = p_relationship_id and status = 'open';
    get diagnostics v_count = row_count;

    if v_count > 0 then
      insert into relationship_timeline (
        relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
      ) values (
        p_relationship_id, 'action_dismissed',
        v_count || ' open action' || case when v_count = 1 then '' else 's' end || ' dismissed.',
        'Dismissed as part of conversion.', 'relationship_actions', p_actor, true
      );
    end if;
  end if;
  -- Any other value (including 'keep_open'/null) is an intentional no-op.
end;
$$;

revoke execute on function resolve_relationship_open_actions(uuid, text, text) from public;
grant execute on function resolve_relationship_open_actions(uuid, text, text) to service_role;

-- ─── Part 12: Resident Prospect → Active Serve Client ───────────────────
-- Resident service/client status is deliberately not written to a separate
-- `residents` column here — see docs/design/RELATIONSHIPS.md, "Active
-- Client status is derived, not duplicated": the same
-- relationship_type = 'active_client' row this function writes is what the
-- Residents directory reads (via getActiveRelationshipSummariesByResident)
-- to derive "Active Serve Client" for the resident, the same way prospect
-- status was made exclusively Relationship-owned in the prior scope. There
-- is nothing else in this app that persists a writable resident-level
-- service-status column.
create or replace function convert_resident_prospect_to_active_client(
  p_relationship_id uuid,
  p_effective_start_date date,
  p_conversion_note text,
  p_open_action_disposition text,
  p_onboarding_action_title text,
  p_onboarding_action_type text,
  p_onboarding_action_due_at timestamptz,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current relationships%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to convert a relationship';
  end if;

  select * into v_current from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  if v_current.relationship_type <> 'resident_prospect' then
    raise exception 'RELATIONSHIP_NOT_ELIGIBLE';
  end if;

  if v_current.resident_id is null then
    raise exception 'A Resident Prospect must be linked to a resident before it can become an Active Client';
  end if;

  if not exists (select 1 from residents where id = v_current.resident_id) then
    raise exception 'Linked resident not found';
  end if;

  insert into relationship_stage_history (relationship_id, from_stage, to_stage, change_reason, changed_by)
  values (p_relationship_id, v_current.stage, 'won', 'Converted to Active Client.', p_actor);

  update relationships
  set relationship_type = 'active_client',
      stage = 'won',
      status = 'active',
      updated_by = p_actor
  where id = p_relationship_id;

  perform resolve_relationship_open_actions(p_relationship_id, p_open_action_disposition, p_actor);

  if p_onboarding_action_title is not null and length(trim(p_onboarding_action_title)) > 0 then
    perform create_relationship_action(
      p_relationship_id, coalesce(p_onboarding_action_type, 'follow_up'), p_onboarding_action_title,
      null, p_onboarding_action_due_at, null, 'normal', p_actor
    );
  end if;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, 'relationship_converted', v_current.display_name || ' became an Active Client.',
    p_conversion_note, 'relationships', p_actor, true
  );

  insert into relationship_conversions (
    relationship_id, from_relationship_type, to_relationship_type, conversion_path,
    resident_id, effective_date, conversion_note, converted_by
  ) values (
    p_relationship_id, 'resident_prospect', 'active_client', 'resident_prospect_to_active_client',
    v_current.resident_id, p_effective_start_date, p_conversion_note, p_actor
  );

  insert into resident_timeline (
    resident_id, event_type, event_title, event_description, source, created_by, system_generated
  ) values (
    v_current.resident_id, 'relationship_conversion', 'Became an Active Serve Client',
    p_conversion_note, 'relationships', p_actor, true
  );

  return p_relationship_id;
end;
$$;

revoke execute on function convert_resident_prospect_to_active_client(
  uuid, date, text, text, text, text, timestamptz, text
) from public;
grant execute on function convert_resident_prospect_to_active_client(
  uuid, date, text, text, text, text, timestamptz, text
) to service_role;

-- ─── Part 14: External Prospect → Active External Client ────────────────
create or replace function convert_external_prospect_to_active_client(
  p_relationship_id uuid,
  p_first_name text,
  p_last_name text,
  p_preferred_name text,
  p_phone text,
  p_email text,
  p_service_address_line_1 text,
  p_service_address_line_2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_primary_contact_name text,
  p_primary_contact_relationship text,
  p_primary_contact_phone text,
  p_primary_contact_email text,
  p_service_start_date date,
  p_conversion_note text,
  p_open_action_disposition text,
  p_onboarding_action_title text,
  p_onboarding_action_type text,
  p_onboarding_action_due_at timestamptz,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current relationships%rowtype;
  v_external_client_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to convert a relationship';
  end if;

  if length(trim(coalesce(p_first_name, ''))) = 0 or length(trim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'First and last name are required to activate an External Client';
  end if;

  if length(trim(coalesce(p_service_address_line_1, ''))) = 0
     or length(trim(coalesce(p_city, ''))) = 0
     or length(trim(coalesce(p_state, ''))) = 0
     or length(trim(coalesce(p_postal_code, ''))) = 0 then
    raise exception 'A complete service address is required to activate an External Client';
  end if;

  select * into v_current from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  if v_current.relationship_type <> 'external_prospect' then
    raise exception 'RELATIONSHIP_NOT_ELIGIBLE';
  end if;

  -- Unique relationship_id constraint on external_clients is the final
  -- guard against a double conversion racing this check (Part 21: "no
  -- duplicate external client").
  insert into external_clients (
    relationship_id, first_name, last_name, preferred_name, phone, email,
    service_address_line_1, service_address_line_2, city, state, postal_code,
    primary_contact_name, primary_contact_relationship, primary_contact_phone, primary_contact_email,
    service_start_date, status, created_by
  ) values (
    p_relationship_id, trim(p_first_name), trim(p_last_name), p_preferred_name, p_phone, p_email,
    p_service_address_line_1, p_service_address_line_2, p_city, p_state, p_postal_code,
    p_primary_contact_name, p_primary_contact_relationship, p_primary_contact_phone, p_primary_contact_email,
    p_service_start_date, 'active', p_actor
  )
  returning id into v_external_client_id;

  insert into relationship_stage_history (relationship_id, from_stage, to_stage, change_reason, changed_by)
  values (p_relationship_id, v_current.stage, 'won', 'Converted to Active External Client.', p_actor);

  update relationships
  set relationship_type = 'active_client',
      stage = 'won',
      status = 'active',
      updated_by = p_actor
  where id = p_relationship_id;

  perform resolve_relationship_open_actions(p_relationship_id, p_open_action_disposition, p_actor);

  if p_onboarding_action_title is not null and length(trim(p_onboarding_action_title)) > 0 then
    perform create_relationship_action(
      p_relationship_id, coalesce(p_onboarding_action_type, 'follow_up'), p_onboarding_action_title,
      null, p_onboarding_action_due_at, null, 'normal', p_actor
    );
  end if;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'relationship_converted', v_current.display_name || ' became an Active External Client.',
    p_conversion_note, 'external_clients', v_external_client_id, p_actor, true
  );

  insert into relationship_conversions (
    relationship_id, from_relationship_type, to_relationship_type, conversion_path,
    external_client_id, effective_date, conversion_note, converted_by
  ) values (
    p_relationship_id, 'external_prospect', 'active_client', 'external_prospect_to_external_client',
    v_external_client_id, p_service_start_date, p_conversion_note, p_actor
  );

  return v_external_client_id;
end;
$$;

revoke execute on function convert_external_prospect_to_active_client(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, date, text, text, text, text, timestamptz, text
) from public;
grant execute on function convert_external_prospect_to_active_client(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, date, text, text, text, text, timestamptz, text
) to service_role;

-- ─── Part 15: External Prospect → New Resident Prospect ─────────────────
-- Inserting into `residents` fires the existing
-- resident_timeline_log_resident_created trigger automatically — Part 15
-- #7's Resident Timeline "resident-created" event comes for free from that
-- trigger, not from code duplicated here.
create or replace function convert_external_prospect_to_new_resident(
  p_relationship_id uuid,
  p_first_name text,
  p_last_name text,
  p_preferred_name text,
  p_community_name text,
  p_unit_number text,
  p_phone text,
  p_email text,
  p_family_contact_name text,
  p_family_contact_relationship text,
  p_family_contact_phone text,
  p_family_contact_email text,
  p_conversion_note text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current relationships%rowtype;
  v_resident_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to convert a relationship';
  end if;

  if length(trim(coalesce(p_first_name, ''))) = 0 or length(trim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'First and last name are required to create a resident';
  end if;

  select * into v_current from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  if v_current.relationship_type <> 'external_prospect' then
    raise exception 'RELATIONSHIP_NOT_ELIGIBLE';
  end if;

  if v_current.resident_id is not null then
    raise exception 'This relationship is already linked to a resident';
  end if;

  insert into residents (
    first_name, last_name, preferred_name, community_name, unit_number,
    phone, email, family_contact_name, family_contact_relationship,
    family_contact_phone, family_contact_email, source_system, is_active, status
  ) values (
    trim(p_first_name), trim(p_last_name), p_preferred_name, p_community_name, p_unit_number,
    p_phone, p_email, p_family_contact_name, p_family_contact_relationship,
    p_family_contact_phone, p_family_contact_email, 'serve_os_manual', true, 'active'
  )
  returning id into v_resident_id;

  update relationships
  set relationship_type = 'resident_prospect',
      resident_id = v_resident_id,
      updated_by = p_actor
  where id = p_relationship_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'relationship_converted',
    v_current.display_name || ' converted to a new Resident Prospect.',
    p_conversion_note, 'residents', v_resident_id, p_actor, true
  );

  insert into relationship_conversions (
    relationship_id, from_relationship_type, to_relationship_type, conversion_path,
    resident_id, effective_date, conversion_note, converted_by
  ) values (
    p_relationship_id, 'external_prospect', 'resident_prospect', 'external_prospect_to_new_resident',
    v_resident_id, current_date, p_conversion_note, p_actor
  );

  return v_resident_id;
end;
$$;

revoke execute on function convert_external_prospect_to_new_resident(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function convert_external_prospect_to_new_resident(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

-- ─── Part 16: External Prospect → Existing Resident Prospect ────────────
-- Duplicate-active-Resident-Prospect checking is done at the app layer
-- (checkForActiveResidentProspect / findActiveResidentProspect), the same
-- as every other Resident Prospect creation path in this app — this
-- function performs the write once the caller has confirmed it, the same
-- division of responsibility link_relationship_to_resident() already uses.
create or replace function convert_external_prospect_to_existing_resident(
  p_relationship_id uuid,
  p_resident_id uuid,
  p_conversion_note text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current relationships%rowtype;
  v_resident_name text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to convert a relationship';
  end if;

  select * into v_current from relationships where id = p_relationship_id for update;
  if not found then
    raise exception 'Relationship not found';
  end if;

  if v_current.relationship_type <> 'external_prospect' then
    raise exception 'RELATIONSHIP_NOT_ELIGIBLE';
  end if;

  select coalesce(nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), display_name, full_name)
  into v_resident_name
  from residents where id = p_resident_id;

  if not found then
    raise exception 'Resident not found';
  end if;

  update relationships
  set relationship_type = 'resident_prospect',
      resident_id = p_resident_id,
      updated_by = p_actor
  where id = p_relationship_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, 'relationship_converted',
    v_current.display_name || ' linked to existing resident ' || coalesce(v_resident_name, 'record') || '.',
    p_conversion_note, 'relationships', p_actor, true
  );

  insert into relationship_conversions (
    relationship_id, from_relationship_type, to_relationship_type, conversion_path,
    resident_id, effective_date, conversion_note, converted_by
  ) values (
    p_relationship_id, 'external_prospect', 'resident_prospect', 'external_prospect_to_existing_resident',
    p_resident_id, current_date, p_conversion_note, p_actor
  );

  return p_relationship_id;
end;
$$;

revoke execute on function convert_external_prospect_to_existing_resident(uuid, uuid, text, text) from public;
grant execute on function convert_external_prospect_to_existing_resident(uuid, uuid, text, text) to service_role;

-- ─── Part 17: External Client lifecycle actions ─────────────────────────

create or replace function place_external_client_on_hold(
  p_relationship_id uuid,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_client external_clients%rowtype;
  v_display_name text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update an external client';
  end if;

  select * into v_client from external_clients where relationship_id = p_relationship_id for update;
  if not found then
    raise exception 'External client not found for this relationship';
  end if;

  select display_name into v_display_name from relationships where id = p_relationship_id;

  update external_clients set status = 'on_hold', updated_by = p_actor where id = v_client.id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, 'external_client_status_changed', coalesce(v_display_name, 'External client') || ' placed on hold.',
    null, 'external_clients', p_actor, true
  );
end;
$$;

revoke execute on function place_external_client_on_hold(uuid, text) from public;
grant execute on function place_external_client_on_hold(uuid, text) to service_role;

create or replace function reactivate_external_client(
  p_relationship_id uuid,
  p_next_action_title text,
  p_next_action_type text,
  p_next_action_due_at timestamptz,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_client external_clients%rowtype;
  v_display_name text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update an external client';
  end if;

  select * into v_client from external_clients where relationship_id = p_relationship_id for update;
  if not found then
    raise exception 'External client not found for this relationship';
  end if;

  select display_name into v_display_name from relationships where id = p_relationship_id;

  update external_clients set status = 'active', updated_by = p_actor where id = v_client.id;

  if p_next_action_title is not null and length(trim(p_next_action_title)) > 0 then
    perform create_relationship_action(
      p_relationship_id, coalesce(p_next_action_type, 'follow_up'), p_next_action_title,
      null, p_next_action_due_at, null, 'normal', p_actor
    );
  end if;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, 'external_client_status_changed', coalesce(v_display_name, 'External client') || ' reactivated.',
    null, 'external_clients', p_actor, true
  );
end;
$$;

revoke execute on function reactivate_external_client(uuid, text, text, timestamptz, text) from public;
grant execute on function reactivate_external_client(uuid, text, text, timestamptz, text) to service_role;

create or replace function mark_external_client_former(
  p_relationship_id uuid,
  p_effective_end_date date,
  p_reason text,
  p_open_action_disposition text,
  p_actor text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_client external_clients%rowtype;
  v_display_name text;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update an external client';
  end if;

  select * into v_client from external_clients where relationship_id = p_relationship_id for update;
  if not found then
    raise exception 'External client not found for this relationship';
  end if;

  select display_name into v_display_name from relationships where id = p_relationship_id;

  update external_clients
  set status = 'former',
      service_end_date = coalesce(p_effective_end_date, current_date),
      former_reason = p_reason,
      updated_by = p_actor
  where id = v_client.id;

  perform resolve_relationship_open_actions(p_relationship_id, p_open_action_disposition, p_actor);

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, 'external_client_status_changed', coalesce(v_display_name, 'External client') || ' marked as former.',
    p_reason, 'external_clients', p_actor, true
  );
end;
$$;

revoke execute on function mark_external_client_former(uuid, date, text, text, text) from public;
grant execute on function mark_external_client_former(uuid, date, text, text, text) to service_role;

commit;
