begin;

-- Fixes a real, live-confirmed bug in merge_residents()
-- (20260805000000_create_resident_identity_resolution.sql): when a
-- duplicate resident already redirects to a canonical resident (a prior
-- merge already ran), the function returned the EXISTING merge event
-- early and never reached the block that resolves p_candidate_id. A
-- later identity candidate detected for the same already-merged pair
-- therefore stayed 'open' forever no matter how many times a reviewer
-- clicked a merge action against it — the RPC silently no-op'd instead of
-- honestly reporting "already consolidated." Live-confirmed on Elliot/
-- Elliott Goldberg: merged 2026-07-23, a fresh candidate was raised for
-- the same pair afterward, and clicking "Same Person" against it left the
-- candidate open with no error and no visible change.
--
-- Fix, minimal: when a redirect for this duplicate already exists —
--   * if it points at the SAME canonical this call is requesting, this is
--     the same pairing being reconfirmed. Nothing to reassign or
--     deactivate again (idempotent, as before) — but if a NEW
--     p_candidate_id was supplied, resolve it now, referencing the
--     merge event that already did the real work. This is the only
--     behavior change: previously p_candidate_id was silently ignored on
--     this path.
--   * if it points at a DIFFERENT canonical, that's a genuine conflict
--     (this duplicate is already redirected elsewhere) — raise a clear
--     exception rather than silently returning an unrelated merge event.
--
-- No change to the not-yet-redirected path (the ordinary first-time merge
-- — still deactivates, creates the redirect + spelling alias, resolves
-- the candidate, and runs/defers consolidation exactly as before).
create or replace function merge_residents(
  p_candidate_id uuid,
  p_canonical_resident_id uuid,
  p_duplicate_resident_id uuid,
  p_defer_consolidation boolean,
  p_field_resolutions jsonb,
  p_actor text,
  p_rationale text
)
returns resident_merge_events
language plpgsql
set search_path = public
as $$
declare
  v_event resident_merge_events%rowtype;
  v_existing_redirect resident_identity_redirects%rowtype;
  v_duplicate_row residents%rowtype;
  v_canonical_row residents%rowtype;
  v_canonical_name text;
  v_duplicate_name text;
  v_alias_id uuid;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to merge residents';
  end if;
  if p_canonical_resident_id = p_duplicate_resident_id then
    raise exception 'Canonical and duplicate residents must be different';
  end if;
  if p_field_resolutions is not null and jsonb_typeof(p_field_resolutions) <> 'object' then
    raise exception 'field_resolutions must be a JSON object';
  end if;

  select * into v_existing_redirect from resident_identity_redirects where duplicate_resident_id = p_duplicate_resident_id;
  if found then
    if v_existing_redirect.canonical_resident_id <> p_canonical_resident_id then
      raise exception 'This resident already redirects to a different canonical resident (%) — resolve that conflict directly, not through a new merge request.', v_existing_redirect.canonical_resident_id;
    end if;

    -- Same pairing, already consolidated (same canonical). Honestly close
    -- out a newly-supplied candidate against the merge event that already
    -- did the real work, instead of leaving it open.
    if p_candidate_id is not null then
      update resident_identity_candidates
      set status = 'resolved_merged', resolved_at = now(), resolved_by = p_actor,
          resolution_rationale = coalesce(p_rationale, 'Already consolidated via merge event ' || v_existing_redirect.merge_event_id::text || '.')
      where id = p_candidate_id and status in ('open', 'investigating');
    end if;

    select * into v_event from resident_merge_events where id = v_existing_redirect.merge_event_id;
    return v_event;
  end if;

  select * into v_duplicate_row from residents where id = p_duplicate_resident_id for update;
  if not found then
    raise exception 'Duplicate resident not found';
  end if;
  select * into v_canonical_row from residents where id = p_canonical_resident_id for update;
  if not found then
    raise exception 'Canonical resident not found';
  end if;

  insert into resident_merge_events (
    candidate_id, canonical_resident_id, duplicate_resident_id, decided_by, rationale, consolidation_status, field_resolutions
  ) values (
    p_candidate_id, p_canonical_resident_id, p_duplicate_resident_id, p_actor, p_rationale, 'pending', coalesce(p_field_resolutions, '{}'::jsonb)
  )
  returning * into v_event;

  update residents set is_active = false, updated_at = now() where id = p_duplicate_resident_id;

  insert into resident_identity_redirects (duplicate_resident_id, canonical_resident_id, merge_event_id)
  values (p_duplicate_resident_id, p_canonical_resident_id, v_event.id);

  v_canonical_name := lower(trim(coalesce(v_canonical_row.first_name, '') || ' ' || coalesce(v_canonical_row.last_name, '')));
  v_duplicate_name := lower(trim(coalesce(v_duplicate_row.first_name, '') || ' ' || coalesce(v_duplicate_row.last_name, '')));

  if v_duplicate_name <> '' and v_duplicate_name <> v_canonical_name then
    insert into resident_identity_aliases (
      canonical_resident_id, alias_type, alias_value, normalized_value, source_system, source_reference, created_by
    ) values (
      p_canonical_resident_id, 'spelling_variant',
      trim(coalesce(v_duplicate_row.first_name, '') || ' ' || coalesce(v_duplicate_row.last_name, '')),
      v_duplicate_name, v_duplicate_row.source_system, v_event.id::text, p_actor
    )
    returning id into v_alias_id;

    update resident_merge_events set aliases_created = aliases_created || jsonb_build_array(v_alias_id) where id = v_event.id;
  end if;

  if p_candidate_id is not null then
    update resident_identity_candidates
    set status = 'resolved_merged', resolved_at = now(), resolved_by = p_actor, resolution_rationale = p_rationale
    where id = p_candidate_id and status in ('open', 'investigating');
  end if;

  if not coalesce(p_defer_consolidation, false) then
    perform perform_resident_consolidation(v_event.id, p_actor);
  end if;

  select * into v_event from resident_merge_events where id = v_event.id;
  return v_event;
end;
$$;

revoke execute on function merge_residents(uuid, uuid, uuid, boolean, jsonb, text, text) from public;
grant execute on function merge_residents(uuid, uuid, uuid, boolean, jsonb, text, text) to service_role;

commit;
