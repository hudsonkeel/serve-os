begin;

-- Phase 2 addendum: identity candidates need somewhere to durably carry
-- their corroborating household evidence — visibly separate from
-- `evidence` (identity-only, what the confidence band was computed from)
-- so the review UI can render "Why this may be the same person" and
-- "Household context" as two distinct sections, never one undifferentiated
-- list. Purely additive: existing rows default to an empty array.

alter table resident_identity_candidates
  add column if not exists household_context jsonb not null default '[]'::jsonb;

alter table resident_identity_candidates
  drop constraint if exists resident_identity_candidates_household_context_is_array_check;
alter table resident_identity_candidates
  add constraint resident_identity_candidates_household_context_is_array_check
  check (jsonb_typeof(household_context) = 'array');

comment on column resident_identity_candidates.household_context is
  'jsonb array of {signalType, residentIdA, residentIdB, description} — household evidence shown as corroborating context. Never counted toward confidence_band; see evidence for what the band was computed from.';

-- ─── create_resident_identity_candidates: now also stores household_context ─
-- Same signature as the Phase 1 version (p_detection_run_id, p_candidates,
-- p_actor) — each element of p_candidates may now additionally carry a
-- `householdContext` key, defaulting to an empty array when absent so
-- existing callers keep working unchanged.
create or replace function create_resident_identity_candidates(
  p_detection_run_id uuid,
  p_candidates jsonb,
  p_actor text
)
returns setof resident_identity_candidates
language plpgsql
set search_path = public
as $$
declare
  v_candidate jsonb;
  v_resident_ids uuid[];
  v_existing_id uuid;
  v_new_id uuid;
  v_member uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to record identity candidates';
  end if;
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' then
    raise exception 'candidates must be a JSON array';
  end if;

  for v_candidate in select * from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb))
  loop
    select array_agg(elem::text::uuid order by elem::text)
    into v_resident_ids
    from jsonb_array_elements_text(v_candidate->'residentIds') as elem;

    if v_resident_ids is null or array_length(v_resident_ids, 1) < 2 then
      raise exception 'Each candidate requires at least two residentIds';
    end if;

    -- Idempotency: an open/investigating candidate with the exact same
    -- member set already exists.
    select c.id into v_existing_id
    from resident_identity_candidates c
    where c.status in ('open', 'investigating')
      and (
        select array_agg(m.resident_id order by m.resident_id)
        from resident_identity_candidate_members m
        where m.candidate_id = c.id
      ) = (select array_agg(x order by x) from unnest(v_resident_ids) as x)
    limit 1;

    if v_existing_id is not null then
      continue;
    end if;

    insert into resident_identity_candidates (
      status, confidence_band, evidence, household_context, matching_rule_version, detection_run_id
    ) values (
      'open', v_candidate->>'confidenceBand', coalesce(v_candidate->'evidence', '[]'::jsonb),
      coalesce(v_candidate->'householdContext', '[]'::jsonb),
      v_candidate->>'matchingRuleVersion', p_detection_run_id
    )
    returning id into v_new_id;

    foreach v_member in array v_resident_ids
    loop
      insert into resident_identity_candidate_members (candidate_id, resident_id) values (v_new_id, v_member);
    end loop;
  end loop;

  return query
  select * from resident_identity_candidates
  where detection_run_id = p_detection_run_id
  order by created_at asc;
end;
$$;

revoke execute on function create_resident_identity_candidates(uuid, jsonb, text) from public;
grant execute on function create_resident_identity_candidates(uuid, jsonb, text) to service_role;

commit;
