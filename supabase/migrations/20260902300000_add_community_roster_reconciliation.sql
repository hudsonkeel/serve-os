begin;

-- Community Roster Import + Reconciliation phase, Pass 2 — identity
-- matching + reconciliation + create/link.
--
-- SAFETY REVIEW (required before applying):
--   - Forward-only: no DROP TABLE, DROP COLUMN, DELETE, TRUNCATE, or data
--     mutation of any kind.
--   - The resolution_status CHECK constraint change only WIDENS an
--     existing allow-list (adds 'possible_match'); every row that
--     satisfied the old constraint still satisfies the new one. The
--     legacy CLI (scripts/importWatermereRoster.ts) never writes
--     'possible_match' — its own reconcileRoster() engine, reused
--     unmodified here, never produces that classification; only the new
--     web-path orchestration layer (lib/residents/roster/
--     communityRosterReconciliation.ts) can.
--   - sync_external_person_identity is a NEW function, not a signature
--     change to sync_axiscare_vendor_identity or
--     sync_axiscare_client_identity (both already in production and left
--     untouched) — same reasoning as 20260819000000's own comment.
--     Genuinely source-and-subject-generic (mirrors
--     create_resident_from_external_source's own p_source_system
--     parameter, 20260902260000), so a future CRM or other importer
--     reuses this one function instead of a third dedicated sync RPC.
--
-- ROLLBACK (safe any time; a 'possible_match' row inserted before
-- rollback would need reclassifying first if a full constraint rollback
-- is intended):
--
--   drop function if exists sync_external_person_identity(text, text, text, text, text, text, uuid, jsonb);
--   alter table roster_source_rows drop constraint if exists roster_source_rows_resolution_status_check;
--   alter table roster_source_rows add constraint roster_source_rows_resolution_status_check
--     check (resolution_status in (
--       'exact_match', 'apartment_change', 'new_resident', 'ambiguous', 'possible_duplicate', 'conflict', 'skipped'
--     ));

-- ─── Widen resolution_status: 'possible_match' ──────────────────────────
-- The roster-specific matcher (matchPerson/reconcileRoster, unmodified)
-- only ever produces the original 7 values from a row's unit/name
-- evidence. 'possible_match' is produced ONLY by the new orchestration
-- layer, for a row the roster matcher itself called 'new_resident' (i.e.
-- "no roster-specific candidate found" — never itself permission to
-- create) where Serve's newer canonical identity signals
-- (lib/residents/identity/identitySignals.ts — exact/near name match,
-- shared DOB, confirmed alias) independently found exactly one credible
-- existing resident. Distinct from 'ambiguous' (multiple candidates,
-- never auto-resolved) and from 'new_resident' (genuinely no candidate
-- from either evidence base) — a single suggested candidate still
-- requires the same explicit human confirm/reject as any other match,
-- never auto-linked.
alter table roster_source_rows drop constraint if exists roster_source_rows_resolution_status_check;
alter table roster_source_rows add constraint roster_source_rows_resolution_status_check
  check (resolution_status in (
    'exact_match', 'apartment_change', 'new_resident', 'ambiguous', 'possible_duplicate', 'conflict', 'skipped',
    'possible_match'
  ));

-- ─── sync_external_person_identity: generic proposed-link upsert ───────
-- Mirrors sync_axiscare_client_identity (20260819000000) exactly — same
-- never-auto-confirm discipline (unchanged/refreshed for an
-- already-confirmed link, skipped_existing_decision for any existing
-- human decision, otherwise inserts exactly one 'proposed' row) — with
-- p_source_system and p_subject_type as parameters instead of hardcoded
-- 'axiscare'/'resident', so this one function serves the community
-- roster path today and any future external-source path without a new
-- per-source RPC. The confirm/reject/defer RPCs this feeds into
-- (confirm_person_vendor_identity_link etc., 20260821000000) were
-- already fully source-generic — this closes the one remaining gap
-- (proposed-link creation) that still required a per-source function.
create or replace function sync_external_person_identity(
  p_source_system text,
  p_subject_type text,
  p_vendor_record_id text,
  p_vendor_display_name text,
  p_match_method text,
  p_match_confidence text,
  p_candidate_subject_id uuid,
  p_approved_source_data jsonb
)
returns table (action text, link_id uuid, subject_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_existing person_vendor_identity_links%rowtype;
  v_new_id uuid;
begin
  if p_source_system is null or length(trim(p_source_system)) = 0 then
    raise exception 'A source system is required';
  end if;
  if p_subject_type is null or length(trim(p_subject_type)) = 0 then
    raise exception 'A subject type is required';
  end if;

  select * into v_existing
  from person_vendor_identity_links
  where source_system = p_source_system
    and subject_type = p_subject_type
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
    p_subject_type, p_candidate_subject_id, p_source_system, p_vendor_record_id, p_vendor_display_name,
    p_match_method, p_match_confidence, 'proposed', p_approved_source_data, now()
  )
  returning id into v_new_id;

  return query select 'proposed'::text, v_new_id, p_candidate_subject_id;
end;
$$;

revoke execute on function sync_external_person_identity(text, text, text, text, text, text, uuid, jsonb) from public;
grant execute on function sync_external_person_identity(text, text, text, text, text, text, uuid, jsonb) to service_role;

commit;
