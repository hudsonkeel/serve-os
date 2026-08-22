begin;

-- AxisCare Reconciliation + Multi-Source Identity Ingestion phase.
--
-- The atomic "Create New Resident" write: when a Reconciliation operator
-- reviews an external source record (AxisCare today; a community roster or
-- CRM import later) and finds no credible existing canonical person, this
-- is the one transaction that creates the resident AND durably links the
-- source record to it -- never a resident created with the source left
-- unmatched, never a link pointing at a resident that doesn't exist.
-- Postgres functions are atomic by default (any raise exception rolls back
-- everything already done in this call), same idiom as the existing
-- convert_external_prospect_to_new_resident (20260807000000).
--
-- Deliberately source-generic (p_source_system is a parameter, not
-- hardcoded 'axiscare') so a future community-roster or CRM importer reuses
-- this exact function rather than building a second creation path.
-- Deliberately does NOT touch axiscare_client_operational_state -- that
-- table is AxisCare-specific staging/cache, not the source of truth (which
-- is person_vendor_identity_links); keeping this RPC ignorant of it is what
-- keeps the contract genuinely source-agnostic. The caller refreshes that
-- cache as a best-effort follow-up (see lib/actions/reconciliation.ts).
--
-- Race safety: a concurrent second call for the same (source_system,
-- subject_type='resident', vendor_record_id) hits
-- person_vendor_identity_links_unique_vendor_record and raises a unique
-- violation (SQLSTATE 23505) -- the caller catches this and reports "already
-- resolved," never a duplicate resident. No explicit locking needed here
-- because the uniqueness is enforced by the insert itself, not a prior read.
create or replace function create_resident_from_external_source(
  p_source_system text,
  p_source_record_id text,
  p_vendor_display_name text,
  p_first_name text,
  p_last_name text,
  p_community_id uuid,
  p_community_name text,
  p_actor text,
  p_rationale text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_resident_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to create a resident';
  end if;
  if length(trim(coalesce(p_first_name, ''))) = 0 or length(trim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'First and last name are required to create a resident';
  end if;
  if p_source_system is null or length(trim(p_source_system)) = 0 then
    raise exception 'A source system is required';
  end if;
  if p_source_record_id is null or length(trim(p_source_record_id)) = 0 then
    raise exception 'A source record id is required';
  end if;

  insert into residents (
    first_name, last_name, community_id, community_name, source_system, is_active, status
  ) values (
    trim(p_first_name), trim(p_last_name), p_community_id, p_community_name, p_source_system, true, 'active'
  )
  returning id into v_resident_id;

  -- created_new_subject / not_applicable: no identity match occurred, so
  -- neither an evidence-based method nor a confidence level applies here --
  -- see 20260902250000's own comment for why 'high' would be misleading.
  insert into person_vendor_identity_links (
    subject_type, subject_id, source_system, vendor_record_id, vendor_display_name,
    match_method, match_confidence, status, resolved_by, resolved_at, resolution_rationale, link_role
  ) values (
    'resident', v_resident_id, p_source_system, p_source_record_id, p_vendor_display_name,
    'created_new_subject', 'not_applicable', 'confirmed', p_actor, now(), p_rationale, 'primary'
  );

  return v_resident_id;
end;
$$;

revoke all on function create_resident_from_external_source(text, text, text, text, text, uuid, text, text, text) from public;
grant execute on function create_resident_from_external_source(text, text, text, text, text, uuid, text, text, text) to service_role;

-- ROLLBACK:
--
--   drop function if exists create_resident_from_external_source(text, text, text, text, text, uuid, text, text, text);

commit;
