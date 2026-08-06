-- Post-Release Stabilization — corrects a real gap in
-- 20260819000000_add_resident_axiscare_client_sync.sql.
--
-- That migration widened person_vendor_identity_links/person_documents's
-- subject_type CHECK constraints to allow 'resident', but did not add a
-- matching branch to assert_valid_person_subject() — the trigger-backed
-- integrity function those tables' BEFORE INSERT/UPDATE triggers call
-- via person_vendor_identity_links_check_subject() /
-- person_documents_check_subject(). 20260808000000's own comment says
-- exactly this, and it was missed:
--
--   "adding another [subject_type] is always a follow-up `alter table
--   ... drop/add constraint` migration plus a new branch in
--   assert_valid_person_subject() below — both travel together, by
--   convention, so the two can never drift out of sync."
--
-- Confirmed live: running sync_axiscare_client_identity() against a real
-- resident produced "unsupported subject_type: resident" from
-- assert_valid_person_subject()'s else branch, for every one of 8
-- attempted rows — 0 rows written, clean atomic rollback each time (a
-- Postgres exception inside a single RPC call rolls back that call's own
-- work; no partial state exists).
--
-- Forward-only: CREATE OR REPLACE on an existing function, adding one
-- new `elsif` branch ahead of the existing `else`. The existing
-- 'workforce_member' branch's behavior is byte-for-byte unchanged.
--
-- ROLLBACK: re-run 20260808000000's original definition of this function
-- (the version without the resident branch) via CREATE OR REPLACE:
--
--   create or replace function assert_valid_person_subject(p_subject_type text, p_subject_id uuid)
--   returns void
--   language plpgsql
--   set search_path = public
--   as $$
--   begin
--     if p_subject_type = 'workforce_member' then
--       if not exists (select 1 from workforce_members where id = p_subject_id) then
--         raise exception 'subject_id % does not reference an existing workforce_members row', p_subject_id;
--       end if;
--     else
--       raise exception 'unsupported subject_type: %', p_subject_type;
--     end if;
--   end;
--   $$;

create or replace function assert_valid_person_subject(p_subject_type text, p_subject_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_subject_type = 'workforce_member' then
    if not exists (select 1 from workforce_members where id = p_subject_id) then
      raise exception 'subject_id % does not reference an existing workforce_members row', p_subject_id;
    end if;
  elsif p_subject_type = 'resident' then
    if not exists (select 1 from residents where id = p_subject_id) then
      raise exception 'subject_id % does not reference an existing residents row', p_subject_id;
    end if;
  else
    raise exception 'unsupported subject_type: %', p_subject_type;
  end if;
end;
$$;
