begin;

-- Corrects the External Prospect domain model: an External Prospect is a
-- prospective client who may receive Serve services outside a supported
-- community — defined by an *expected service location*, not by the
-- absence of a linked resident. See docs/design/RELATIONSHIPS.md,
-- "External Prospect domain model."
--
-- Two additions:
--   1. Structured prospective-client identity on `relationships` (first/
--      last/preferred name, phone, email) plus an explicit
--      "primary contact is the prospective client" flag — replacing the
--      free-text-only `prospective_resident_name` for this purpose.
--      `prospective_resident_name` itself is untouched (still used by
--      historical rows and by `getProspectOrResidentLabel()`'s fallback).
--   2. `relationship_service_locations` — a structured, Relationship-
--      linked postal address, separate from `relationship_service_opportunities`
--      (see "Why a new table, not relationship_service_opportunities"
--      below) — required for External Prospect creation, editable during
--      prospecting, and carried forward (confirmed, not silently
--      overwritten) into the External Client's operational service
--      address at conversion.

alter table relationships
  add column if not exists prospective_client_first_name text,
  add column if not exists prospective_client_last_name text,
  add column if not exists prospective_client_preferred_name text,
  add column if not exists prospective_client_phone text,
  add column if not exists prospective_client_email text,
  add column if not exists primary_contact_is_prospective_client boolean not null default false;

-- Why a new table, not `relationship_service_opportunities`: that table
-- (20260718010000_create_relationship_service_opportunities.sql) is
-- explicitly a *care-planning* surface — visits/week, preferred days,
-- estimated visit duration, a coarse draft/ready/superseded status — the
-- rough shape of a future schedule, not a postal address. A service
-- *location* is a different kind of fact (where), with its own lifecycle
-- (proposed while prospecting → confirmed at conversion → operational
-- once active) and its own required-field rules (a real address is
-- mandatory for External Prospect creation; none of
-- relationship_service_opportunities' fields are mandatory). Conflating
-- the two would mean either forcing an address into a table designed for
-- optional care-planning notes, or making service-opportunity fields
-- artificially required. A dedicated table keeps a single, unambiguous
-- source of truth for "where," addressable independently of "how much
-- care."
create table if not exists relationship_service_locations (
  id                uuid primary key default gen_random_uuid(),
  relationship_id   uuid not null references public.relationships(id) on delete cascade,

  -- 'expected_service_location': the current, editable, pre-conversion
  -- proposed address. 'confirmed_at_conversion': an immutable snapshot
  -- written once, at the moment an External Prospect activates (see
  -- convert_external_prospect_to_active_client() below) — never edited
  -- again, so the Relationship always retains exactly what was confirmed
  -- at that moment even if the External Client's own address is later
  -- changed through a different path.
  location_type     text not null default 'expected_service_location',

  address_line_1    text not null,
  address_line_2    text,
  city              text not null,
  state             text not null,
  postal_code       text not null,

  -- Contextual only — never a substitute for the postal address above.
  residence_type    text,
  facility_name     text,
  location_notes    text,

  -- Forward compatibility for future service-area/travel logic (Part 15
  -- of the scope that introduced this table): deliberately unpopulated
  -- and uncalculated in this phase. Adding real values later must never
  -- require changing what the postal-address columns above mean.
  latitude                numeric,
  longitude               numeric,
  geocoded_at              timestamptz,
  distance_from_office_miles  numeric,

  -- Exactly one row per Relationship may be "current" at a time — see the
  -- partial unique index below. Every other row for that Relationship is
  -- historical (superseded edits are not versioned individually here;
  -- only the pre- vs. post-conversion transition is preserved as two
  -- distinct rows).
  is_current        boolean not null default true,

  created_by        text not null,
  created_at        timestamptz not null default now(),
  updated_by        text,
  updated_at        timestamptz not null default now(),

  constraint relationship_service_locations_type_check
    check (location_type in ('expected_service_location', 'confirmed_at_conversion')),

  constraint relationship_service_locations_residence_type_check
    check (residence_type is null or residence_type in (
      'private_home', 'apartment', 'independent_living', 'assisted_living',
      'skilled_nursing', 'family_member_home', 'other'
    )),

  constraint relationship_service_locations_address_line_1_not_blank
    check (length(trim(address_line_1)) > 0),
  constraint relationship_service_locations_city_not_blank
    check (length(trim(city)) > 0),
  constraint relationship_service_locations_state_not_blank
    check (length(trim(state)) > 0),
  constraint relationship_service_locations_postal_code_not_blank
    check (length(trim(postal_code)) > 0)
);

-- One current location per Relationship, enforced by the database, not
-- just application logic (Part 15: "no duplicate active service-location
-- records").
create unique index if not exists relationship_service_locations_one_current_idx
  on relationship_service_locations (relationship_id)
  where is_current;

create index if not exists relationship_service_locations_relationship_idx
  on relationship_service_locations (relationship_id, created_at desc);

alter table relationship_service_locations enable row level security;

create or replace function relationship_service_locations_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on relationship_service_locations;
create trigger set_updated_at
  before update on relationship_service_locations
  for each row execute function relationship_service_locations_set_updated_at();

-- New Timeline event type: readable, specific address-change history —
-- distinct from the generic 'relationship_updated' used for owner/
-- priority edits, since "where" is meaningfully different context than
-- "who owns this."
alter table relationship_timeline drop constraint if exists relationship_timeline_event_type_check;
alter table relationship_timeline add constraint relationship_timeline_event_type_check
  check (event_type in (
    'relationship_created', 'resident_linked', 'stage_changed', 'touch_logged',
    'action_created', 'action_updated', 'action_completed', 'action_dismissed',
    'relationship_won', 'relationship_on_hold', 'relationship_closed',
    'working_note_created', 'working_note_resolved', 'service_opportunity_updated',
    'relationship_updated', 'relationship_converted', 'external_client_status_changed',
    'service_location_updated'
  ));

-- Postgres identifies functions by (name, parameter types) — adding
-- trailing parameters creates a distinct overload rather than replacing
-- the prior signature, so it must be dropped explicitly (same reasoning
-- as 20260718000000_add_relationship_test_marker.sql).
drop function if exists create_relationship(
  text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
);

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
  p_actor text,
  p_test_marker text default null,
  p_prospective_client_first_name text default null,
  p_prospective_client_last_name text default null,
  p_prospective_client_preferred_name text default null,
  p_prospective_client_phone text default null,
  p_prospective_client_email text default null,
  p_primary_contact_is_prospective_client boolean default false
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
    priority, source_type, source_label, created_by, test_marker,
    prospective_client_first_name, prospective_client_last_name,
    prospective_client_preferred_name, prospective_client_phone, prospective_client_email,
    primary_contact_is_prospective_client
  ) values (
    p_relationship_type, p_stage, p_display_name, p_resident_id, p_prospect_id,
    p_community_name, p_organization_name,
    p_primary_contact_name, p_primary_contact_relationship, p_primary_contact_phone, p_primary_contact_email,
    p_prospective_resident_name, p_summary, p_owner_label,
    coalesce(p_priority, 'normal'), p_source_type, p_source_label, p_actor, p_test_marker,
    p_prospective_client_first_name, p_prospective_client_last_name,
    p_prospective_client_preferred_name, p_prospective_client_phone, p_prospective_client_email,
    coalesce(p_primary_contact_is_prospective_client, false)
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
  text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean
) from public;
grant execute on function create_relationship(
  text, text, text, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean
) to service_role;

-- Atomic upsert of the *current* expected service location for a
-- Relationship: creates it if none exists, otherwise diffs against the
-- current row and only writes + logs a Timeline event when something
-- actually changed — same no-op-safe pattern as
-- upsert_relationship_service_opportunity(). Never touches a
-- 'confirmed_at_conversion' row (those are immutable snapshots, not
-- editable — see convert_external_prospect_to_active_client() below).
create or replace function upsert_relationship_service_location(
  p_relationship_id uuid,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_residence_type text,
  p_facility_name text,
  p_location_notes text,
  p_actor text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current relationship_service_locations%rowtype;
  v_id uuid;
  v_changed boolean := false;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to save a service location';
  end if;

  if length(trim(coalesce(p_address_line_1, ''))) = 0
     or length(trim(coalesce(p_city, ''))) = 0
     or length(trim(coalesce(p_state, ''))) = 0
     or length(trim(coalesce(p_postal_code, ''))) = 0 then
    raise exception 'A complete service address is required';
  end if;

  if not exists (select 1 from relationships where id = p_relationship_id) then
    raise exception 'Relationship not found';
  end if;

  select * into v_current
  from relationship_service_locations
  where relationship_id = p_relationship_id
    and location_type = 'expected_service_location'
    and is_current
  for update;

  if not found then
    insert into relationship_service_locations (
      relationship_id, location_type, address_line_1, address_line_2, city, state, postal_code,
      residence_type, facility_name, location_notes, is_current, created_by
    ) values (
      p_relationship_id, 'expected_service_location', p_address_line_1, p_address_line_2, p_city, p_state, p_postal_code,
      p_residence_type, p_facility_name, p_location_notes, true, p_actor
    )
    returning id into v_id;

    insert into relationship_timeline (
      relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
    ) values (
      p_relationship_id, 'service_location_updated', 'Expected service location added.',
      'Service address set to ' || p_address_line_1 || ', ' || p_city || ', ' || p_state || ' ' || p_postal_code || '.',
      'relationship_service_locations', v_id, p_actor, true
    );

    return v_id;
  end if;

  v_changed :=
    v_current.address_line_1 is distinct from p_address_line_1 or
    v_current.address_line_2 is distinct from p_address_line_2 or
    v_current.city is distinct from p_city or
    v_current.state is distinct from p_state or
    v_current.postal_code is distinct from p_postal_code or
    v_current.residence_type is distinct from p_residence_type or
    v_current.facility_name is distinct from p_facility_name or
    v_current.location_notes is distinct from p_location_notes;

  if not v_changed then
    return v_current.id;
  end if;

  update relationship_service_locations
  set address_line_1 = p_address_line_1,
      address_line_2 = p_address_line_2,
      city = p_city,
      state = p_state,
      postal_code = p_postal_code,
      residence_type = p_residence_type,
      facility_name = p_facility_name,
      location_notes = p_location_notes,
      updated_by = p_actor
  where id = v_current.id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'service_location_updated', 'Expected service location updated.',
    'Service address changed to ' || p_address_line_1 || ', ' || p_city || ', ' || p_state || ' ' || p_postal_code || '.',
    'relationship_service_locations', v_current.id, p_actor, true
  );

  return v_current.id;
end;
$$;

revoke execute on function upsert_relationship_service_location(
  uuid, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function upsert_relationship_service_location(
  uuid, text, text, text, text, text, text, text, text, text
) to service_role;

-- ─── Carry the confirmed address forward at conversion ──────────────────
-- Replaces the prior version of this function (Part 14 of the External
-- Clients scope) to also snapshot the confirmed address into
-- relationship_service_locations, per the source-of-truth rule: before
-- activation, the current 'expected_service_location' row is
-- authoritative; the values confirmed on this form (which may differ from
-- that row, if the user corrected them) become both the External Client's
-- operational address (external_clients, unchanged from before) *and* a
-- new immutable 'confirmed_at_conversion' snapshot — so the Relationship
-- always shows exactly what was confirmed, without silently overwriting
-- the original proposed-location history. residence_type/facility_name/
-- location_notes (not part of this form) carry forward unchanged from
-- whatever the prior current location had, since those are contextual
-- fields this conversion step doesn't ask the user to re-confirm.
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
  v_prior_location relationship_service_locations%rowtype;
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

  select * into v_prior_location
  from relationship_service_locations
  where relationship_id = p_relationship_id and is_current
  for update;

  update relationship_service_locations
  set is_current = false, updated_by = p_actor
  where relationship_id = p_relationship_id and is_current;

  insert into relationship_service_locations (
    relationship_id, location_type, address_line_1, address_line_2, city, state, postal_code,
    residence_type, facility_name, location_notes, is_current, created_by
  ) values (
    p_relationship_id, 'confirmed_at_conversion', p_service_address_line_1, p_service_address_line_2, p_city, p_state, p_postal_code,
    v_prior_location.residence_type, v_prior_location.facility_name, v_prior_location.location_notes, true, p_actor
  );

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

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, source_record_id, created_by, system_generated
  ) values (
    p_relationship_id, 'service_location_updated', 'Expected service location confirmed.',
    'Service address confirmed as ' || p_service_address_line_1 || ', ' || p_city || ', ' || p_state || ' ' || p_postal_code || '.',
    'relationship_service_locations', v_external_client_id, p_actor, true
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

commit;
