-- Post-Release Stabilization — AxisCare Operational Synchronization,
-- Workstream 2. Extends the existing person_vendor_identity_links
-- platform (built for workforce_member/caregiver sync in
-- 20260808000000) to also support subject_type='resident', reusing the
-- exact same proven, human-confirmation-required discipline rather than
-- inventing a second identity-linking mechanism.
--
-- A NEW function (sync_axiscare_client_identity), not a signature change
-- to the existing sync_axiscare_vendor_identity, because that function is
-- already called in production by lib/workforce/axiscareCaregiverSync.ts
-- with its current 6-argument signature — changing it would risk exactly
-- the kind of breaking-signature incident documented in
-- docs/architecture/SERVE_OS_ARCHITECTURE_VALIDATION_REPORT.md's
-- convert_external_prospect_to_new_resident finding. Purely additive.
--
-- SAFETY REVIEW (required before applying):
--   - Forward-only: no DROP TABLE, DROP COLUMN, DELETE, TRUNCATE, or data
--     mutation of any kind. The two constraint changes only WIDEN an
--     existing allow-list (adds 'resident' alongside the existing
--     'workforce_member'); every row that satisfied the old constraint
--     still satisfies the new one.
--   - The new function only ever inserts a 'proposed' row or updates a
--     row it already owns (source_system='axiscare',
--     subject_type='resident') — it cannot touch workforce_member rows,
--     residents rows, or any row inserted by a human decision.
--
-- ROLLBACK (if ever needed — safe to run any time after this migration,
-- even with resident-type rows already present, since it only removes
-- the *capability* to link residents, not any resident/link data itself;
-- rolling back with resident-type rows already inserted will leave those
-- rows in place but orphaned from the narrower constraint, so drop them
-- first if a full rollback is intended):
--
--   drop function if exists sync_axiscare_client_identity(text, text, text, text, uuid, jsonb);
--   alter table person_vendor_identity_links drop constraint if exists person_vendor_identity_links_subject_type_check;
--   alter table person_vendor_identity_links add constraint person_vendor_identity_links_subject_type_check
--     check (subject_type in ('workforce_member'));
--   alter table person_documents drop constraint if exists person_documents_subject_type_check;
--   alter table person_documents add constraint person_documents_subject_type_check
--     check (subject_type in ('workforce_member'));

alter table person_vendor_identity_links drop constraint if exists person_vendor_identity_links_subject_type_check;
alter table person_vendor_identity_links add constraint person_vendor_identity_links_subject_type_check
  check (subject_type in ('workforce_member', 'resident'));

alter table person_documents drop constraint if exists person_documents_subject_type_check;
alter table person_documents add constraint person_documents_subject_type_check
  check (subject_type in ('workforce_member', 'resident'));

-- Mirrors sync_axiscare_vendor_identity() exactly (same never-auto-confirm
-- discipline: unchanged/refreshed for an already-confirmed link, no-op for
-- any existing human decision, otherwise inserts one 'proposed' row) —
-- only the hardcoded subject_type and the returned identifier column
-- differ.
create or replace function sync_axiscare_client_identity(
  p_vendor_record_id text,
  p_vendor_display_name text,
  p_match_method text,
  p_match_confidence text,
  p_candidate_subject_id uuid,
  p_approved_source_data jsonb
)
returns table (action text, link_id uuid, resident_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_existing person_vendor_identity_links%rowtype;
  v_new_id uuid;
begin
  select * into v_existing
  from person_vendor_identity_links
  where source_system = 'axiscare'
    and subject_type = 'resident'
    and vendor_record_id = p_vendor_record_id
  for update;

  if found and v_existing.status = 'confirmed' then
    if v_existing.approved_source_data = p_approved_source_data then
      update person_vendor_identity_links
      set last_synced_at = now()
      where id = v_existing.id;

      return query select 'unchanged'::text, v_existing.id, v_existing.subject_id;
      return;
    end if;

    update person_vendor_identity_links
    set approved_source_data = p_approved_source_data,
        vendor_display_name = p_vendor_display_name,
        last_synced_at = now()
    where id = v_existing.id;

    return query select 'refreshed'::text, v_existing.id, v_existing.subject_id;
    return;
  end if;

  if found then
    return query select 'skipped_existing_decision'::text, v_existing.id, v_existing.subject_id;
    return;
  end if;

  insert into person_vendor_identity_links (
    subject_type, subject_id, source_system, vendor_record_id, vendor_display_name,
    match_method, match_confidence, status, approved_source_data, last_synced_at
  ) values (
    'resident', p_candidate_subject_id, 'axiscare', p_vendor_record_id, p_vendor_display_name,
    p_match_method, p_match_confidence, 'proposed', p_approved_source_data, now()
  )
  returning id into v_new_id;

  return query select 'proposed'::text, v_new_id, p_candidate_subject_id;
end;
$$;

revoke execute on function sync_axiscare_client_identity(text, text, text, text, uuid, jsonb) from public;
grant execute on function sync_axiscare_client_identity(text, text, text, text, uuid, jsonb) to service_role;
