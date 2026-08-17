-- Audit Readiness v0.1 — Phase 1, Migration 1 of 4.
--
-- Widens person_evidence to allow subject_type = 'resident', mirroring the
-- exact precedent already used for person_vendor_identity_links and
-- person_documents in 20260819000000_add_resident_axiscare_client_sync.sql
-- and 20260820000000_add_resident_to_person_subject_integrity.sql.
--
-- person_documents was widened to residents in those two migrations;
-- person_evidence was not, and its own CHECK constraint has blocked any
-- resident-scoped verification/lifecycle record ever since. This is the
-- one genuine hard blocker identified in the Audit Readiness Phase 0 report
-- for Module D (Client File Readiness) — nothing else about this migration
-- is new capability, it is closing a gap the prior two migrations already
-- established the pattern for.
--
-- assert_valid_person_subject() already has a 'resident' branch (added by
-- 20260820000000), so person_evidence_check_subject()'s trigger needs no
-- change here — only the table's own CHECK constraint was narrower than
-- the shared integrity function it calls.
--
-- SAFETY REVIEW:
--   - Forward-only: no DROP TABLE, DROP COLUMN, DELETE, TRUNCATE, or data
--     mutation of any kind. The constraint change only WIDENS an existing
--     allow-list (adds 'resident' alongside the existing 'workforce_member');
--     every row that satisfied the old constraint still satisfies the new
--     one.
--   - Does not touch workforce_member evidence in any way.
--
-- ROLLBACK (safe to run any time after this migration, even with
-- resident-type rows already present — narrows the *capability* only; drop
-- resident-type person_evidence rows first if a full rollback is intended):
--
--   alter table person_evidence drop constraint if exists person_evidence_subject_type_check;
--   alter table person_evidence add constraint person_evidence_subject_type_check
--     check (subject_type in ('workforce_member'));

begin;

alter table person_evidence drop constraint if exists person_evidence_subject_type_check;
alter table person_evidence add constraint person_evidence_subject_type_check
  check (subject_type in ('workforce_member', 'resident'));

commit;
