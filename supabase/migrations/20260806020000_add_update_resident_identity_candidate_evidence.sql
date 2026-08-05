begin;

-- Phase 2 migration support: some Phase 1 candidates were opened with real
-- identity evidence that Phase 1's engine simply didn't know how to name
-- yet (e.g. "Marilyn Born" / "Marilyn Holstein Born" was only caught via a
-- shared phone number under Phase 1 — the new compound_name_variant signal
-- recognizes it as a genuine identity match). For candidates like this,
-- the correct migration step is NOT to dismiss them as household-only —
-- it's to refresh their stored evidence to the current Phase 2 shape
-- (identity evidence vs. household_context, split) while leaving the
-- candidate open. This RPC performs exactly that in-place refresh; it
-- never changes status, canonical/duplicate assignment, or anything else.
create or replace function update_resident_identity_candidate_evidence(
  p_candidate_id uuid,
  p_confidence_band text,
  p_evidence jsonb,
  p_household_context jsonb,
  p_matching_rule_version text,
  p_actor text
)
returns resident_identity_candidates
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_row resident_identity_candidates%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to update a candidate';
  end if;

  select status into v_status from resident_identity_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'Candidate not found';
  end if;
  if v_status not in ('open', 'investigating') then
    raise exception 'Only open/investigating candidates can have their evidence refreshed';
  end if;

  update resident_identity_candidates
  set confidence_band = p_confidence_band,
      evidence = coalesce(p_evidence, '[]'::jsonb),
      household_context = coalesce(p_household_context, '[]'::jsonb),
      matching_rule_version = p_matching_rule_version
  where id = p_candidate_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function update_resident_identity_candidate_evidence(uuid, text, jsonb, jsonb, text, text) from public;
grant execute on function update_resident_identity_candidate_evidence(uuid, text, jsonb, jsonb, text, text) to service_role;

commit;
