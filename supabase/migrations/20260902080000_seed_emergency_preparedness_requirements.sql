-- Emergency Preparedness Activation — Phase B, Migration 2 of 3.
--
-- Seeds the 9 requirements approved in
-- docs/architecture/AUDIT_READINESS_EMERGENCY_PREPAREDNESS_REQUIREMENT_DRAFT.md
-- (Phase A, approved) as real person_requirements reference data, mirroring
-- WORKFORCE_EMPLOYEE_RECORD_AUDIT's exact seed shape
-- (20260814000000_add_employee_record_audit.sql).
--
-- Only 6 of the 9 are actually agency-level, single-subject requirements —
-- EMERGENCY_PREPAREDNESS_READINESS links only those six:
--   EP_PLAN_MAINTAINED, EP_DISASTER_COORDINATOR_DESIGNATED,
--   EP_RISK_ASSESSMENT_CURRENT, EP_ANNUAL_PLAN_REVIEW,
--   EP_ANNUAL_RESPONSE_DRILL, EP_HHS_NOTIFICATION.
--
-- The other 3 are seeded as real reference data (so they're traceable and
-- ready for their owning domain to claim) but deliberately NOT linked into
-- this requirement set — each belongs to a different subject/domain than
-- the agency-level Emergency Preparedness workspace this phase builds:
--   - EP_STAFF_TRAINED is subject workforce_member. Per the requirement
--     draft's own ownership note, its evidence/status/corrective-action
--     lifecycle belongs in Workforce's existing Employee Record Audit
--     pipeline (WORKFORCE_EMPLOYEE_RECORD_AUDIT), the same requirement set
--     HIPAA_HB300_TRAINING/INFECTION_CONTROL_TRAINING already live in.
--     Linking it there changes every employee's existing readiness
--     evaluation — a Workforce-domain scope decision this Emergency
--     Preparedness pass does not make unilaterally. Flagged, not silently
--     dropped; see the Phase B report.
--   - EP_CLIENT_TRIAGE_CLASSIFIED and EP_CLIENT_INFO_PROVIDED_AT_ADMISSION
--     are subject resident — the draft's own applicability note names them
--     "the first real Module D (Client File Readiness)" requirements, a
--     separate Audit Readiness domain (still "Coming Soon" on the
--     dashboard) that this phase does not build.
--
-- SAFETY REVIEW: pure reference-data insert, on conflict do nothing
-- throughout (idempotent replay-safe, same as every prior requirement
-- seed). No existing row is touched.
--
-- ROLLBACK: delete the 9 requirement_code rows below from
-- person_requirements (cascades nothing — no evidence will exist against
-- them before this migration is applied), and the
-- EMERGENCY_PREPAREDNESS_READINESS row from requirement_sets
-- (requirement_set_members rows are deleted by the requirement deletes'
-- FK... no cascade defined, so delete requirement_set_members rows for
-- this set first, then the set itself).
--
-- NOT YET APPLIED — pending explicit approval, per standing instruction.

begin;

insert into public.person_requirements
  (requirement_code, name, description, category, domain, regulatory_authority, requires_document, requires_verification)
values
  ('EP_PLAN_MAINTAINED',
   'Emergency Preparedness and Response Plan (EPRP) On File and Current',
   'The Emergency Preparedness and Response Plan (EPRP) is developed, maintained, and current.',
   'plan_governance', 'emergency_preparedness',
   'Serve P&P §256, opening policy statement',
   true, true),

  ('EP_DISASTER_COORDINATOR_DESIGNATED',
   'Disaster Coordinator and Alternate Designated',
   'The Administrator (Disaster Coordinator) and Alternate Administrator (Alternate Disaster Coordinator) are designated and registered with the AlertMedia state-wide emergency reporting system.',
   'plan_governance', 'emergency_preparedness',
   'Serve P&P §256, item 2',
   true, true),

  ('EP_RISK_ASSESSMENT_CURRENT',
   'Risk Assessment and Hazard Vulnerability Assessment Current',
   'A risk assessment identifying the potential natural and man-made disasters most likely to occur in Serve''s service area is on file and current.',
   'plan_governance', 'emergency_preparedness',
   'Serve P&P §256, item 5',
   true, true),

  ('EP_ANNUAL_PLAN_REVIEW',
   'Annual EPRP Review',
   'The Administrator and designated individuals review the EPRP at least annually, and after each actual emergency response, to evaluate its effectiveness and update it as needed.',
   'plan_governance', 'emergency_preparedness',
   'Serve P&P §256, annual review clause',
   true, true),

  ('EP_ANNUAL_RESPONSE_DRILL',
   'Annual Response-Phase Drill or Qualifying Actual Response',
   'The response phase of the EPRP is tested annually via a planned Communication Tree drill, unless already tested during an actual emergency response within the same period.',
   'plan_governance', 'emergency_preparedness',
   'Serve P&P §256, drill clause',
   true, true),

  ('EP_HHS_NOTIFICATION',
   'HHS Notification of Temporary Relocation or Service-Area Expansion',
   'HHS Home and Community Support Services Agencies licensing unit is notified no later than five working days after a temporary office relocation or temporary service-area expansion resulting from an emergency.',
   'plan_governance', 'emergency_preparedness',
   'Serve P&P §256, HHS notification section',
   true, true),

  -- Seeded as reference data only — see the migration header. Not linked
  -- into EMERGENCY_PREPAREDNESS_READINESS.
  ('EP_STAFF_TRAINED',
   'Staff Trained on EPRP Responsibilities',
   'Staff are trained and oriented on their EPRP responsibilities upon hire, whenever the plan is revised, and annually via the response drill or an actual plan activation.',
   'training_competency', 'emergency_preparedness',
   'Serve P&P §256; Continuing Education section',
   true, true),

  ('EP_CLIENT_TRIAGE_CLASSIFIED',
   'Client Emergency Triage Classification On File',
   'A completed, signed Emergency Preparedness Classification Assessment (4-level triage) is on file for the client.',
   'client_safety', 'emergency_preparedness',
   'Serve P&P §256, item 4',
   true, true),

  ('EP_CLIENT_INFO_PROVIDED_AT_ADMISSION',
   'Client Provided EPRP Information at Admission',
   'The client was provided Serve''s EPRP information (staff responsibilities, client responsibilities, community disaster resources, survival tips) at admission, with a signed acknowledgment on file.',
   'client_safety', 'emergency_preparedness',
   'Serve P&P §256, admission information clause',
   true, true)
on conflict (requirement_code) do nothing;

insert into public.requirement_sets (set_code, name, description, category)
values ('EMERGENCY_PREPAREDNESS_READINESS', 'Emergency Preparedness Readiness',
        'Serve''s agency-level Emergency Preparedness and Response Plan (EPRP) requirements, per P&P §256.',
        'audit_checklist')
on conflict (set_code) do nothing;

insert into public.requirement_set_members (requirement_set_id, requirement_id, sort_order)
select rs.id, pr.id,
  array_position(
    array['EP_PLAN_MAINTAINED','EP_DISASTER_COORDINATOR_DESIGNATED','EP_RISK_ASSESSMENT_CURRENT',
          'EP_ANNUAL_PLAN_REVIEW','EP_ANNUAL_RESPONSE_DRILL','EP_HHS_NOTIFICATION'],
    pr.requirement_code
  )
from public.requirement_sets rs
cross join public.person_requirements pr
where rs.set_code = 'EMERGENCY_PREPAREDNESS_READINESS'
  and pr.requirement_code in (
    'EP_PLAN_MAINTAINED','EP_DISASTER_COORDINATOR_DESIGNATED','EP_RISK_ASSESSMENT_CURRENT',
    'EP_ANNUAL_PLAN_REVIEW','EP_ANNUAL_RESPONSE_DRILL','EP_HHS_NOTIFICATION'
  )
on conflict (requirement_set_id, requirement_id) do nothing;

commit;
