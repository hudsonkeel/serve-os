begin;

-- Add New Client phase — Canonical Client Creation Independent of AxisCare
-- Timing. Serve OS must be able to create the canonical person and an
-- active Serve relationship BEFORE AxisCare exists; AxisCare reconciliation
-- (unmodified, existing machinery) resolves a later-arriving AxisCare
-- record back to this same canonical person.
--
-- Governing entity separation: canonical resident, Serve relationship, and
-- AxisCare identity are three separate things. This RPC creates exactly
-- the first two, atomically, in one transaction — never a third
-- (person_vendor_identity_links) row, since there is no external vendor
-- record at manual-creation time (see create_resident_from_external_source,
-- 20260902260000, for the AxisCare/roster-sourced counterpart that DOES
-- write one).
--
-- The Serve relationship is established via the SAME governed correction
-- mechanism resident_serve_relationship_corrections already provides
-- (20260826000000) — inlined here (one INSERT, not a nested call to
-- correct_resident_serve_relationship) so both writes commit or roll back
-- together. This is deliberate, not cosmetic: projectServeRelationship's
-- own precedence (lib/residents/serveRelationshipProjection.ts) is
-- AxisCare match > CRM Relationship > legacy resident status, and
-- AxisCare wins UNCONDITIONALLY whenever any match exists, regardless of
-- confidence. Without a correction row, a later AxisCare match — even a
-- weak candidate-confidence one, even one whose class/status disagrees —
-- would silently override a manually-established Active Client the
-- moment reconciliation ran. The correction is what makes
-- applyServeRelationshipCorrection() keep displaying this operator's
-- decision, surfacing any later disagreement as hasConflict instead of
-- silently discarding it.
--
-- residents.serve_relationship_status is ALSO set directly (not left at
-- its 'none' default) so the NATURAL projection agrees with the
-- correction from the moment of creation — no manufactured hasConflict
-- before any real evidence exists.
--
-- SAFETY REVIEW:
--   - Forward-only, additive: one new function, no schema/constraint
--     changes (residents already has every column this needs — address,
--     city, state, zip_code, phone, email, date_of_birth, unit_number,
--     building — confirmed by inspection, nothing new added).
--   - Fresh duplicate check happens at the APPLICATION layer immediately
--     before this RPC is called (lib/actions/addClient.ts), matching the
--     exact precedent createResidentFromAxisCareRecord/
--     createResidentFromRosterRow already established — this RPC itself
--     does not re-check, same documented, accepted small race window
--     those two paths already carry.
--
-- ROLLBACK:
--   revoke execute on function create_resident_manual(text, text, uuid, text, text, text, date, text, text, text, text, text, text, text, text, text) from service_role;
--   drop function if exists create_resident_manual(text, text, uuid, text, text, text, date, text, text, text, text, text, text, text, text, text);
create or replace function create_resident_manual(
  p_first_name text,
  p_last_name text,
  p_community_id uuid,
  p_community_name text,
  p_phone text,
  p_email text,
  p_date_of_birth date,
  p_address text,
  p_city text,
  p_state text,
  p_zip_code text,
  p_unit_number text,
  p_building text,
  p_serve_relationship_status text,
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
    raise exception 'An authenticated actor is required to create a client';
  end if;
  if length(trim(coalesce(p_first_name, ''))) = 0 or length(trim(coalesce(p_last_name, ''))) = 0 then
    raise exception 'First and last name are required to create a client';
  end if;
  if p_community_id is null then
    raise exception 'A community is required to create a client';
  end if;
  if p_serve_relationship_status not in ('active_client', 'prospect') then
    raise exception 'Invalid Serve relationship status for manual creation: %', p_serve_relationship_status;
  end if;

  insert into residents (
    first_name, last_name, community_id, community_name,
    phone, email, date_of_birth, address, city, state, zip_code,
    unit_number, building,
    source_system, serve_relationship_status, is_active, status
  ) values (
    trim(p_first_name), trim(p_last_name), p_community_id, p_community_name,
    nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_email, '')), ''), p_date_of_birth,
    nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_state, '')), ''), nullif(trim(coalesce(p_zip_code, '')), ''),
    nullif(trim(coalesce(p_unit_number, '')), ''), nullif(trim(coalesce(p_building, '')), ''),
    'serve_manual', p_serve_relationship_status, true, 'active'
  )
  returning id into v_resident_id;

  insert into resident_serve_relationship_corrections (
    resident_id, previous_value, new_value, actor, rationale
  ) values (
    v_resident_id, null, p_serve_relationship_status, p_actor,
    coalesce(nullif(trim(coalesce(p_rationale, '')), ''), 'Established via Add New Client onboarding.')
  );

  return v_resident_id;
end;
$$;

revoke all on function create_resident_manual(text, text, uuid, text, text, text, date, text, text, text, text, text, text, text, text, text) from public;
grant execute on function create_resident_manual(text, text, uuid, text, text, text, date, text, text, text, text, text, text, text, text, text) to service_role;

commit;
