-- Post-Release Stabilization — Workstream 2 (governed resident profile
-- editing). Adds "profile_updated" to resident_timeline's event_type
-- vocabulary so a governed edit (lib/actions/residents.ts) leaves a real
-- audit entry, following the exact same additive
-- drop-constraint/add-constraint pattern already used by every prior
-- extension of this same check (see 20260716050000, 20260719000000).
-- Purely additive: existing rows and existing event types are unaffected.

alter table resident_timeline drop constraint if exists resident_timeline_event_type_check;
alter table resident_timeline add constraint resident_timeline_event_type_check
  check (event_type in (
    'resident_created',
    'current_needs_updated',
    'working_note_created',
    'working_note_resolved',
    'relationship_conversion',
    'profile_updated'
  ));
