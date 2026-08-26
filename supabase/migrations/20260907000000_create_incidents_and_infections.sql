begin;

-- Incidents & Infections v0.1 — Slice 1 (database foundation only).
--
-- Two new canonical event tables, feeding the QAPI "record once → understand
-- → review → act → resolve → learn" pipeline described in the Incidents &
-- Infections v0.1 investigation report. Deliberately NOT built on the
-- compliance_corrective_actions polymorphic-subject pattern
-- (20260902030000_create_audit_readiness_platform.sql) — an incident/
-- infection is a first-class factual record in its own right, not a
-- finding against a requirement, and its involved-party shape (a client
-- AND/OR a staff member, independently, or neither) doesn't fit that
-- table's single-subject model.
--
-- SCOPE (Slice 1 only — confirmed with product before writing this file):
--   - incidents, infections tables
--   - create / mark-reviewed / resolve RPCs for each
--   - role-appropriate structural guarantees (actor required, resolution
--     requires a prior review, resolution requires a note)
--   - community scoping (nullable community_id, resolved by the caller —
--     this migration does not infer it from resident_id)
--   - actor/timestamp auditability on every state transition
--
-- EXPLICITLY DEFERRED (do not infer from this file's shape that these were
-- forgotten — they were cut on purpose for v0.1):
--   - evidence/document attachments (no table, no storage bucket)
--   - linkage to compliance_corrective_actions (owner/follow_up_required
--     live directly on these rows for v0.1; a future phase can add a
--     nullable source_incident_id/source_infection_id column to
--     compliance_corrective_actions, widening its subject_type CHECK the
--     same way 20260819000000 widened an existing CHECK, without touching
--     this migration)
--   - a dedicated timeline/activity table (created_by/reviewed_by/
--     resolved_by + their timestamps ARE the v0.1 audit trail)
--   - an edit/reopen RPC beyond the three below
--   - any regulatory/reportability/clinical-severity classification —
--     incident_type is an operational organization label only
--
-- ROLE ENFORCEMENT NOTE: matching every other table in this schema, RLS is
-- enabled with zero policies (service_role bypasses; anon/authenticated get
-- nothing), and the RPCs below take a plain actor identity string, not a
-- role. Real authorization — view: admin/manager/executive/operations,
-- create: admin/manager/operations, review/resolve: admin/manager, with
-- create NOT implying review/resolve — is enforced the same place it
-- already is for compliance_corrective_actions/audit_sessions/etc.: named
-- canX(role) predicates in the server-action layer (lib/compliance/
-- permissions.ts precedent), called before these RPCs are ever reached.
-- Slice 2 must add the three canX predicates for this feature; there is
-- deliberately no role column or role check anywhere in this file.
--
-- SAFETY REVIEW: two net-new tables, six net-new RPCs. No existing table,
-- column, constraint, or function is touched.

-- ─── Incidents ──────────────────────────────────────────────────────────
create table if not exists incidents (
  id                    uuid primary key default gen_random_uuid(),

  community_id          uuid references public.communities(id) on delete restrict,

  -- Both nullable and independent — an incident may involve a client, a
  -- staff member, both, or (e.g. a property/facility incident) neither.
  resident_id           uuid references public.residents(id) on delete restrict,
  workforce_member_id   uuid references public.workforce_members(id) on delete restrict,

  occurred_at           timestamptz not null,
  location              text,

  incident_type         text not null,
  -- Required only when incident_type = 'other' — see the check below.
  incident_type_other   text,

  description           text not null,
  immediate_response    text,

  injury_occurred        boolean not null default false,
  injury_medical_details text,

  -- Free-text labels (e.g. "Family notified", "EMS called", "Supervisor
  -- notified") — same array-of-labels shape as audit_sessions.scope_domains.
  -- Not a controlled vocabulary; nothing here implies a regulatory
  -- notification requirement was or wasn't met.
  parties_notified      text[] not null default '{}'::text[],

  -- "Does something still need to happen, and who owns it?" — deliberately
  -- NOT a second corrective-action system. See migration header.
  follow_up_required    boolean not null default false,
  owner                 text,

  notes                 text,

  review_status         text not null default 'not_reviewed',
  reviewed_by            text,
  reviewed_at            timestamptz,

  status                text not null default 'open',
  resolution_note        text,
  resolved_by             text,
  resolved_at             timestamptz,

  created_by            text not null,
  created_at            timestamptz not null default now(),
  updated_by            text,
  updated_at            timestamptz,

  constraint incidents_incident_type_check
    check (incident_type in (
      'fall', 'injury', 'wandering_elopement', 'medication_event',
      'service_failure', 'safety_event', 'property_concern', 'other'
    )),

  constraint incidents_incident_type_other_required_check
    check (incident_type <> 'other' or length(trim(coalesce(incident_type_other, ''))) > 0),

  constraint incidents_description_not_blank
    check (length(trim(description)) > 0),

  constraint incidents_created_by_not_blank
    check (length(trim(created_by)) > 0),

  constraint incidents_review_status_check
    check (review_status in ('not_reviewed', 'reviewed')),

  -- A review is either fully pending or fully recorded — never half-way.
  constraint incidents_review_consistency_check
    check (
      (review_status = 'not_reviewed' and reviewed_by is null and reviewed_at is null)
      or
      (review_status = 'reviewed' and reviewed_by is not null and reviewed_at is not null)
    ),

  constraint incidents_status_check
    check (status in ('open', 'resolved')),

  -- Same discipline as compliance_corrective_actions_resolution_fields_check:
  -- resolution fields are either all null (open) or all present (resolved) —
  -- and a resolution always needs its own note, never inherits one.
  constraint incidents_resolution_consistency_check
    check (
      (status = 'open' and resolved_by is null and resolved_at is null and resolution_note is null)
      or
      (status = 'resolved' and resolved_by is not null and resolved_at is not null and resolution_note is not null)
    ),

  -- Structural guarantee of the mission's Record -> Review -> Resolve
  -- ordering: an incident can never reach 'resolved' without having passed
  -- through 'reviewed' first. Enforced here (not just in the RPC below) so
  -- it holds regardless of write path.
  constraint incidents_resolve_requires_review_check
    check (status <> 'resolved' or review_status = 'reviewed')
);

create index if not exists incidents_status_review_idx
  on incidents (status, review_status);

create index if not exists incidents_resident_idx
  on incidents (resident_id) where resident_id is not null;

create index if not exists incidents_workforce_member_idx
  on incidents (workforce_member_id) where workforce_member_id is not null;

create index if not exists incidents_community_idx
  on incidents (community_id) where community_id is not null;

create index if not exists incidents_occurred_at_idx
  on incidents (occurred_at desc);

alter table incidents enable row level security;
revoke all on incidents from public, anon, authenticated;
grant all on incidents to service_role;

create or replace function create_incident(
  p_community_id uuid,
  p_resident_id uuid,
  p_workforce_member_id uuid,
  p_occurred_at timestamptz,
  p_location text,
  p_incident_type text,
  p_incident_type_other text,
  p_description text,
  p_immediate_response text,
  p_injury_occurred boolean,
  p_injury_medical_details text,
  p_parties_notified text[],
  p_follow_up_required boolean,
  p_owner text,
  p_notes text,
  p_actor text
)
returns public.incidents
language plpgsql
set search_path = public
as $$
declare
  v_result public.incidents%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to create an incident';
  end if;

  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'A factual description is required';
  end if;

  if p_occurred_at is null then
    raise exception 'An event date/time is required';
  end if;

  insert into public.incidents (
    community_id, resident_id, workforce_member_id,
    occurred_at, location, incident_type, incident_type_other,
    description, immediate_response,
    injury_occurred, injury_medical_details,
    parties_notified, follow_up_required, owner, notes,
    created_by
  ) values (
    p_community_id, p_resident_id, p_workforce_member_id,
    p_occurred_at, p_location, p_incident_type, p_incident_type_other,
    p_description, p_immediate_response,
    coalesce(p_injury_occurred, false), p_injury_medical_details,
    coalesce(p_parties_notified, '{}'::text[]), coalesce(p_follow_up_required, false), p_owner, p_notes,
    p_actor
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function create_incident(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text,
  boolean, text, text[], boolean, text, text, text
) from public;
grant execute on function create_incident(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text,
  boolean, text, text[], boolean, text, text, text
) to service_role;

-- Review is where leadership confirms (or sets, if not yet known at intake)
-- whether follow-up is required and who owns it — the mission's "Review
-- appropriately" step is exactly when that judgment gets made. Idempotent:
-- calling this again on an already-reviewed incident just re-affirms the
-- follow-up decision without moving reviewed_by/reviewed_at forward, the
-- same "don't silently re-timestamp" discipline save_qapi_domain_note uses
-- for a no-op save.
create or replace function mark_incident_reviewed(
  p_incident_id uuid,
  p_follow_up_required boolean,
  p_owner text,
  p_actor text
)
returns public.incidents
language plpgsql
set search_path = public
as $$
declare
  v_current public.incidents%rowtype;
  v_result public.incidents%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to review an incident';
  end if;

  if p_follow_up_required is null then
    raise exception 'A follow-up decision (yes/no) is required to review an incident';
  end if;

  select * into v_current from public.incidents where id = p_incident_id for update;

  if not found then
    raise exception 'Incident % not found', p_incident_id;
  end if;

  if v_current.review_status = 'reviewed' then
    update public.incidents
    set follow_up_required = p_follow_up_required,
        owner = p_owner,
        updated_by = p_actor,
        updated_at = now()
    where id = p_incident_id
    returning * into v_result;
    return v_result;
  end if;

  update public.incidents
  set review_status = 'reviewed',
      reviewed_by = p_actor,
      reviewed_at = now(),
      follow_up_required = p_follow_up_required,
      owner = p_owner,
      updated_by = p_actor,
      updated_at = now()
  where id = p_incident_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function mark_incident_reviewed(uuid, boolean, text, text) from public;
grant execute on function mark_incident_reviewed(uuid, boolean, text, text) to service_role;

-- Resolution always requires its own note and always requires the incident
-- to already be reviewed (also structurally guaranteed by
-- incidents_resolve_requires_review_check above — this raises a clear
-- error rather than letting the caller hit a bare constraint violation).
-- Not idempotent, matching resolve_compliance_corrective_action: resolving
-- an already-resolved incident is treated as a caller error, not a silent
-- no-op, since each resolution note is a deliberate, one-time statement.
create or replace function resolve_incident(
  p_incident_id uuid,
  p_resolution_note text,
  p_actor text
)
returns public.incidents
language plpgsql
set search_path = public
as $$
declare
  v_current public.incidents%rowtype;
  v_result public.incidents%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve an incident';
  end if;

  if p_resolution_note is null or length(trim(p_resolution_note)) = 0 then
    raise exception 'A resolution note is required';
  end if;

  select * into v_current from public.incidents where id = p_incident_id for update;

  if not found then
    raise exception 'Incident % not found', p_incident_id;
  end if;

  if v_current.status = 'resolved' then
    raise exception 'Incident % is already resolved', p_incident_id;
  end if;

  if v_current.review_status <> 'reviewed' then
    raise exception 'Incident % must be reviewed before it can be resolved', p_incident_id;
  end if;

  update public.incidents
  set status = 'resolved',
      resolution_note = trim(p_resolution_note),
      resolved_by = p_actor,
      resolved_at = now(),
      updated_by = p_actor,
      updated_at = now()
  where id = p_incident_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function resolve_incident(uuid, text, text) from public;
grant execute on function resolve_incident(uuid, text, text) to service_role;

-- ─── Infections ─────────────────────────────────────────────────────────
-- Texas PAS-only, operationally simple by explicit product decision — see
-- migration header. Structurally mirrors incidents' review/resolve shape
-- exactly (same two-gate discipline, same follow_up_required/owner
-- convention) so the two features stay easy to reason about together, even
-- though their factual fields differ.
create table if not exists infections (
  id                    uuid primary key default gen_random_uuid(),

  community_id          uuid references public.communities(id) on delete restrict,

  -- Unlike incidents, always about a specific client.
  resident_id           uuid not null references public.residents(id) on delete restrict,

  disclosed_at           date not null,
  condition_description text not null,
  treatment_description text,

  -- Free text — the discloser may not be a Serve staff member (the client
  -- themselves, a family member, another caregiver), so this is
  -- deliberately not an actor identity column. "Who recorded it" is
  -- created_by below, the same Serve-staff-identity convention every other
  -- table in this schema uses.
  disclosed_by           text,

  follow_up_required    boolean not null default false,
  owner                 text,

  notes                 text,

  review_status         text not null default 'not_reviewed',
  reviewed_by            text,
  reviewed_at            timestamptz,

  status                text not null default 'open',
  resolution_note        text,
  resolved_by             text,
  resolved_at             timestamptz,

  created_by            text not null,
  created_at            timestamptz not null default now(),
  updated_by            text,
  updated_at            timestamptz,

  constraint infections_condition_description_not_blank
    check (length(trim(condition_description)) > 0),

  constraint infections_created_by_not_blank
    check (length(trim(created_by)) > 0),

  constraint infections_review_status_check
    check (review_status in ('not_reviewed', 'reviewed')),

  constraint infections_review_consistency_check
    check (
      (review_status = 'not_reviewed' and reviewed_by is null and reviewed_at is null)
      or
      (review_status = 'reviewed' and reviewed_by is not null and reviewed_at is not null)
    ),

  constraint infections_status_check
    check (status in ('open', 'resolved')),

  constraint infections_resolution_consistency_check
    check (
      (status = 'open' and resolved_by is null and resolved_at is null and resolution_note is null)
      or
      (status = 'resolved' and resolved_by is not null and resolved_at is not null and resolution_note is not null)
    ),

  constraint infections_resolve_requires_review_check
    check (status <> 'resolved' or review_status = 'reviewed')
);

create index if not exists infections_status_review_idx
  on infections (status, review_status);

create index if not exists infections_resident_idx
  on infections (resident_id);

create index if not exists infections_community_idx
  on infections (community_id) where community_id is not null;

create index if not exists infections_disclosed_at_idx
  on infections (disclosed_at desc);

alter table infections enable row level security;
revoke all on infections from public, anon, authenticated;
grant all on infections to service_role;

create or replace function create_infection(
  p_community_id uuid,
  p_resident_id uuid,
  p_disclosed_at date,
  p_condition_description text,
  p_treatment_description text,
  p_disclosed_by text,
  p_follow_up_required boolean,
  p_owner text,
  p_notes text,
  p_actor text
)
returns public.infections
language plpgsql
set search_path = public
as $$
declare
  v_result public.infections%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to create an infection record';
  end if;

  if p_resident_id is null then
    raise exception 'A client is required for an infection record';
  end if;

  if p_condition_description is null or length(trim(p_condition_description)) = 0 then
    raise exception 'Infection/condition information is required';
  end if;

  if p_disclosed_at is null then
    raise exception 'The date the infection was disclosed to Serve is required';
  end if;

  insert into public.infections (
    community_id, resident_id, disclosed_at,
    condition_description, treatment_description, disclosed_by,
    follow_up_required, owner, notes,
    created_by
  ) values (
    p_community_id, p_resident_id, p_disclosed_at,
    p_condition_description, p_treatment_description, p_disclosed_by,
    coalesce(p_follow_up_required, false), p_owner, p_notes,
    p_actor
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function create_infection(
  uuid, uuid, date, text, text, text, boolean, text, text, text
) from public;
grant execute on function create_infection(
  uuid, uuid, date, text, text, text, boolean, text, text, text
) to service_role;

create or replace function mark_infection_reviewed(
  p_infection_id uuid,
  p_follow_up_required boolean,
  p_owner text,
  p_actor text
)
returns public.infections
language plpgsql
set search_path = public
as $$
declare
  v_current public.infections%rowtype;
  v_result public.infections%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to review an infection record';
  end if;

  if p_follow_up_required is null then
    raise exception 'A follow-up decision (yes/no) is required to review an infection record';
  end if;

  select * into v_current from public.infections where id = p_infection_id for update;

  if not found then
    raise exception 'Infection record % not found', p_infection_id;
  end if;

  if v_current.review_status = 'reviewed' then
    update public.infections
    set follow_up_required = p_follow_up_required,
        owner = p_owner,
        updated_by = p_actor,
        updated_at = now()
    where id = p_infection_id
    returning * into v_result;
    return v_result;
  end if;

  update public.infections
  set review_status = 'reviewed',
      reviewed_by = p_actor,
      reviewed_at = now(),
      follow_up_required = p_follow_up_required,
      owner = p_owner,
      updated_by = p_actor,
      updated_at = now()
  where id = p_infection_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function mark_infection_reviewed(uuid, boolean, text, text) from public;
grant execute on function mark_infection_reviewed(uuid, boolean, text, text) to service_role;

create or replace function resolve_infection(
  p_infection_id uuid,
  p_resolution_note text,
  p_actor text
)
returns public.infections
language plpgsql
set search_path = public
as $$
declare
  v_current public.infections%rowtype;
  v_result public.infections%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve an infection record';
  end if;

  if p_resolution_note is null or length(trim(p_resolution_note)) = 0 then
    raise exception 'A resolution note is required';
  end if;

  select * into v_current from public.infections where id = p_infection_id for update;

  if not found then
    raise exception 'Infection record % not found', p_infection_id;
  end if;

  if v_current.status = 'resolved' then
    raise exception 'Infection record % is already resolved', p_infection_id;
  end if;

  if v_current.review_status <> 'reviewed' then
    raise exception 'Infection record % must be reviewed before it can be resolved', p_infection_id;
  end if;

  update public.infections
  set status = 'resolved',
      resolution_note = trim(p_resolution_note),
      resolved_by = p_actor,
      resolved_at = now(),
      updated_by = p_actor,
      updated_at = now()
  where id = p_infection_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function resolve_infection(uuid, text, text) from public;
grant execute on function resolve_infection(uuid, text, text) to service_role;

commit;
