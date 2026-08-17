-- Audit Readiness v0.1 — Phase 1A follow-up. NOT YET APPLIED.
--
-- Phase 1A verification (live, against the already-applied Supabase
-- environment) found that compliance_corrective_actions.audit_session_item_id
-- has NO enforced foreign key to audit_session_items.id today, even though
-- 20260902030000_create_audit_readiness_platform.sql's current text
-- includes one, added at the end of that file specifically because
-- audit_session_items didn't exist yet earlier in the same migration.
--
-- Confirmed live: inserting a compliance_corrective_actions row with a
-- random, non-existent audit_session_item_id succeeded rather than being
-- rejected — proof the constraint is absent from the deployed database,
-- not merely untested. The stray row created by that proof was deleted
-- immediately by the verification script; no persistent test data or
-- schema change resulted from that check.
--
-- Likely cause (not certain — no migration-history tracking is queryable
-- through the REST-only access available in this environment): the
-- constraint was added to the migration file after 20260902030000 was
-- already applied by hand via the Supabase SQL editor, so the file now on
-- disk is ahead of what actually ran. This migration closes that gap
-- without re-running 20260902030000 in full.
--
-- Severity: IMPORTANT BEFORE AUGUST 26, not a Phase 2 blocker —
-- audit_session_item_id is Audit Drill linkage (spec Module F), which the
-- Evidence Repository phase does not depend on. See the Phase 1A report.
--
-- SAFETY REVIEW: idempotent (drop-if-exists then add, same pattern as
-- every subject_type CHECK widening in this series), additive-only, does
-- not touch any row's data. Every existing compliance_corrective_actions
-- row already has audit_session_item_id = null (the table is currently
-- empty in production, confirmed live during Phase 1A verification), so
-- there is no possibility of this constraint rejecting pre-existing data.

begin;

alter table compliance_corrective_actions
  drop constraint if exists compliance_corrective_actions_audit_session_item_fk;
alter table compliance_corrective_actions
  add constraint compliance_corrective_actions_audit_session_item_fk
  foreign key (audit_session_item_id) references public.audit_session_items(id) on delete no action;

commit;
