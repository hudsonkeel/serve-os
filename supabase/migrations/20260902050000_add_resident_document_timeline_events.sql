-- Audit Readiness v0.1 — Phase 2 (Evidence Repository). NOT YET APPLIED —
-- reported here per explicit instruction before running any further
-- production migration.
--
-- Widens resident_timeline's event_type CHECK to add the two events
-- Phase 2's resident document/evidence workflow needs to record —
-- mirroring workforce_activity's own 'document_uploaded'/'evidence_*'
-- vocabulary for the same underlying person_documents/person_evidence
-- actions, now exercised for the first time against a resident subject.
-- This is the "client evidence lives with clients" principle made
-- concrete: the resident-domain event goes to resident_timeline (this
-- resident's own existing activity log), never to compliance_activity
-- (Audit Readiness's own table for audit-native findings) and never to a
-- new resident-evidence-specific table.
--
-- Same additive, idempotent-replay-safe pattern as every enum widening in
-- this series (drop-if-exists, then add) — see
-- 20260814000000_add_employee_record_audit.sql's own widening of
-- workforce_activity_event_type_check for the direct precedent.
--
-- SAFETY REVIEW: additive only. No row, column, or existing constraint
-- value is removed. The base list below is copied verbatim from the
-- current live constraint as defined by
-- 20260818000000_add_resident_profile_update_event.sql (the most recent
-- prior widening) — NOT from the original 4-value list in
-- 20260716010000_create_resident_timeline.sql, which is stale. Basing
-- this on the stale list would have silently dropped
-- 'follow_up_updated'/'relationship_conversion'/'profile_updated' support,
-- a real regression this review caught before it was ever applied.

begin;

alter table resident_timeline
  drop constraint if exists resident_timeline_event_type_check;

alter table resident_timeline
  add constraint resident_timeline_event_type_check
  check (event_type in (
    'current_needs_updated',
    'follow_up_updated',
    'resident_created',
    'working_note_created',
    'working_note_resolved',
    'relationship_conversion',
    'profile_updated',
    'document_uploaded',
    'document_superseded'
  ));

commit;
