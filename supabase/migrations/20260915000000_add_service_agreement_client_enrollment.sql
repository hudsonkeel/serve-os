begin;

-- Client enrollment lifecycle, Slice 1: Service Agreement -> Enrolled
-- Inactive Client. Canonical lifecycle (established 2026-09-15):
--   Assessment creates knowledge. Signed Service Agreement creates the
--   client relationship (Inactive by default). A subsequent, separate,
--   explicit action activates the client only once service is actually
--   requested.
-- This matters financially: Serve is billed by AxisCare per Active
-- client, so enrollment must never be able to produce an Active client
-- as a side effect.
--
-- 'inactive_client' joins 'active_client' as a sibling relationship_type
-- on the existing `relationships` CRM table -- both represent "this
-- person is an enrolled Serve Client," the activation dimension now
-- expressed structurally (which relationship_type the row carries)
-- rather than needing a resident_serve_relationship_corrections row.
-- Corrections remain reserved for genuine human overrides of an
-- incorrectly-computed relationship; this migration never uses that
-- mechanism to produce the normal, expected state.
alter table relationships drop constraint if exists relationships_type_check;
alter table relationships add constraint relationships_type_check
  check (relationship_type in (
    'resident_prospect', 'external_prospect', 'active_client', 'inactive_client', 'former_client',
    'referral_source', 'community_partner', 'professional_contact', 'other'
  ));

alter table relationship_conversions drop constraint if exists relationship_conversions_path_check;
alter table relationship_conversions add constraint relationship_conversions_path_check
  check (conversion_path in (
    'resident_prospect_to_active_client',
    'resident_prospect_to_inactive_client',
    'external_prospect_to_external_client',
    'external_prospect_to_new_resident',
    'external_prospect_to_existing_resident'
  ));

-- Resident Prospect -> Enrolled Client (Inactive by default). Modeled on
-- convert_resident_prospect_to_active_client() (Part 12,
-- 20260719000000_create_external_clients_and_conversions.sql) for the
-- guard clauses, timeline/history bookkeeping, and conversion recording
-- -- but deliberately NOT a like-for-like copy. Two differences from that
-- function are intentional, not omissions:
--   1. Does not call resolve_relationship_open_actions(). Enrollment is
--      not "winning" the relationship in the same operational sense as
--      Activation -- open actions on the prospect relationship stay open
--      for whoever owns the next step (which may itself be Activation).
--   2. Does not create an onboarding/service-start follow-up action.
--      Service has not been requested yet at enrollment time; Activation
--      owns service-start behavior, not enrollment.
-- This function must NEVER be extended to accept an "activate" parameter,
-- resolve open actions, or create a service-start follow-up -- doing any
-- of those is Activation's job (not yet built), so enrollment can never
-- accidentally create an Active AxisCare client or claim service-start
-- responsibilities that belong to a later, explicit action.
create or replace function convert_resident_prospect_to_inactive_client(
  p_relationship_id uuid,
  p_effective_date date,
  p_conversion_note text,
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
    raise exception 'A Resident Prospect must be linked to a resident before it can be enrolled as a client';
  end if;

  if not exists (select 1 from residents where id = v_current.resident_id) then
    raise exception 'Linked resident not found';
  end if;

  insert into relationship_stage_history (relationship_id, from_stage, to_stage, change_reason, changed_by)
  values (
    p_relationship_id, v_current.stage, 'won',
    'Enrolled as a Serve Client (signed Service Agreement) -- Inactive until service is requested.',
    p_actor
  );

  update relationships
  set relationship_type = 'inactive_client',
      stage = 'won',
      status = 'active',
      updated_by = p_actor
  where id = p_relationship_id;

  insert into relationship_timeline (
    relationship_id, event_type, event_title, event_description, source_type, created_by, system_generated
  ) values (
    p_relationship_id, 'relationship_converted',
    v_current.display_name || ' enrolled as a Serve Client (Inactive -- no services scheduled yet).',
    p_conversion_note, 'relationships', p_actor, true
  );

  insert into relationship_conversions (
    relationship_id, from_relationship_type, to_relationship_type, conversion_path,
    resident_id, effective_date, conversion_note, converted_by
  ) values (
    p_relationship_id, 'resident_prospect', 'inactive_client', 'resident_prospect_to_inactive_client',
    v_current.resident_id, p_effective_date, p_conversion_note, p_actor
  );

  insert into resident_timeline (
    resident_id, event_type, event_title, event_description, source, created_by, system_generated
  ) values (
    v_current.resident_id, 'relationship_conversion', 'Enrolled as a Serve Client (Inactive)',
    p_conversion_note, 'relationships', p_actor, true
  );

  return p_relationship_id;
end;
$$;

revoke execute on function convert_resident_prospect_to_inactive_client(uuid, date, text, text) from public;
grant execute on function convert_resident_prospect_to_inactive_client(uuid, date, text, text) to service_role;

commit;
