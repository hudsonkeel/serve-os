-- Post-Release Stabilization — Workstream 2 (governed resident profile
-- editing). Adds "profile_updated" to resident_timeline's event_type
-- vocabulary so a governed edit (lib/actions/residents.ts) leaves a real
-- audit entry, following the exact same additive
-- drop-constraint/add-constraint pattern already used by every prior
-- extension of this same check (see 20260716050000, 20260719000000).
-- Purely additive: existing rows and existing event types are unaffected.
--
-- CORRECTED: the first version of this migration was written against
-- lib/supabase/types.ts's ResidentTimelineEventType union, which is
-- stale relative to the live database — it omitted "follow_up_updated",
-- a value already present on live rows. Postgres validates a new CHECK
-- constraint against every existing row by default, so the original
-- version failed to apply outright (constraint violated by existing
-- rows), rather than silently succeeding. This version's allow-list is
-- the confirmed live value set plus the three new additions, not the
-- (inaccurate) TypeScript union.
alter table resident_timeline drop constraint if exists resident_timeline_event_type_check;
alter table resident_timeline add constraint resident_timeline_event_type_check
  check (event_type in (
    'current_needs_updated',
    'follow_up_updated',
    'resident_created',
    'working_note_created',
    'working_note_resolved',
    'relationship_conversion',
    'profile_updated'
  ));
