-- Client Readiness v0.1 — Migration 2 of 2.
--
-- Seeds the 10 approved CR_* requirements (per "Client Readiness — Phase
-- A.2 Architecture Lock") and links them, plus the existing EP_CLIENT_
-- TRIAGE_CLASSIFIED (already seeded by
-- 20260902080000_seed_emergency_preparedness_requirements.sql, resident-
-- scoped, deliberately unlinked until now), into one new
-- CLIENT_RECORD_READINESS requirement set. 11 total members. No new
-- requirement row is created for triage — reusing the existing one exactly
-- as the architecture lock specifies, never duplicating it.
--
-- CR_RECORD_RETENTION_COMPLIANT is intentionally NOT seeded here — it
-- remains a real organizational compliance concern (§301 item 3, 5-year +
-- litigation hold) but not a client-facing readiness card, per the
-- approved architecture.
--
-- Mirrors WORKFORCE_EMPLOYEE_RECORD_AUDIT's and EMERGENCY_PREPAREDNESS_
-- READINESS's exact seed shape. Same on-conflict-do-nothing idempotency.
--
-- SAFETY REVIEW: pure reference-data insert. No existing row touched.
--
-- APPLIED — confirmed live 2026-08-16 (Live Product Verification pass):
-- CLIENT_RECORD_READINESS set exists with exactly 11 members (10 new CR_*
-- plus reused EP_CLIENT_TRIAGE_CLASSIFIED, never duplicated);
-- CR_RECORD_RETENTION_COMPLIANT correctly absent (org-level, not seeded).

begin;

insert into public.person_requirements
  (requirement_code, name, description, category, domain, regulatory_authority, requires_document, requires_verification)
values
  ('CR_CLIENT_PROFILE_ON_FILE',
   'Client Identity & Core Information',
   'Required canonical client facts (name, DOB, sex, service location, admission date, physician, legal guardian or confirmed none) are on file and current.',
   'profile', 'client_readiness',
   'Serve P&P §301(a)',
   false, false),

  ('CR_ASSESSMENT_CURRENT',
   'Assessment / Current Care Needs',
   'A current Serve Assessment reflecting the client''s current care picture is on file, reassessed at least every 365 days or earlier if status changes.',
   'assessment', 'client_readiness',
   'Serve P&P §281',
   false, true),

  ('CR_ISP_ON_FILE_AND_CURRENT',
   'Individualized Service Plan (ISP)',
   'A current ISP specifying services requested, dietary restrictions, supplies/equipment, location, frequency/duration, planned start date, supervision plan, and charges is on file.',
   'care_plan', 'client_readiness',
   'Serve P&P §301(b), §404',
   true, true),

  ('CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED',
   'Service Agreement',
   'A signed Service Agreement — schedule, planned start date, supervision plan, Bill of Rights acknowledgment, abuse/neglect-policy acknowledgment, complaint-process acknowledgment, and Advance-Directive-policy acknowledgment — is on file.',
   'agreements', 'client_readiness',
   'Serve P&P §301(c,i,j,k,n), §292',
   true, true),

  ('CR_BILLING_AGREEMENT_ON_FILE',
   'Billing / Payment Authorization',
   'The agreed charges for services rendered and payment source are documented — typically within the same Service Agreement.',
   'agreements', 'client_readiness',
   'Serve P&P §301(d), §292',
   true, true),

  ('CR_MEDICATION_LIST_ON_FILE',
   'Medication List Available',
   'The required current medication list, if applicable, is present in the client''s physical Serve folder. Serve OS does not transcribe or maintain the list itself.',
   'medication', 'client_readiness',
   'Serve P&P §301(f)',
   false, true),

  ('CR_CARE_DOCUMENTATION_CURRENT',
   'Care / Service Documentation',
   'Required care/service documentation ("Care Notes") has been reviewed and verified present in AxisCare, the current operational source.',
   'care_documentation', 'client_readiness',
   'Serve P&P §301(e)',
   false, true),

  ('CR_SUPERVISORY_VISIT_RECORDED',
   'Annual Supervisory Visit',
   'An annual supervisory visit — reviewing Client Profile, ISP, and Emergency/Triage classification, plus a client satisfaction check — has been completed and recorded within the last 12 months.',
   'supervisory', 'client_readiness',
   'Serve P&P §404',
   true, true),

  ('CR_SIGNIFICANT_EVENTS_DOCUMENTED',
   'Significant Client Events',
   'Documentation exists for every recorded significant client event. Not applicable when no significant event has occurred.',
   'events', 'client_readiness',
   'Serve P&P §301(h)',
   true, true),

  ('CR_DISCHARGE_SUMMARY_ON_FILE',
   'Discharge / Transfer',
   'A discharge summary — reason, notice to client/physician, notice to others — is on file. Applicable only once the client is no longer an active Serve client.',
   'discharge', 'client_readiness',
   'Serve P&P §301(m), §295',
   true, true)
on conflict (requirement_code) do nothing;

insert into public.requirement_sets (set_code, name, description, category)
values ('CLIENT_RECORD_READINESS', 'Client Record Readiness',
        'Serve''s per-client record requirements — canonical facts, governed agreements/plans, and documented reviews — per P&P §301 and its cross-referenced sections.',
        'audit_checklist')
on conflict (set_code) do nothing;

insert into public.requirement_set_members (requirement_set_id, requirement_id, sort_order)
select rs.id, pr.id,
  array_position(
    array['CR_CLIENT_PROFILE_ON_FILE','CR_ASSESSMENT_CURRENT','EP_CLIENT_TRIAGE_CLASSIFIED',
          'CR_ISP_ON_FILE_AND_CURRENT','CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED','CR_BILLING_AGREEMENT_ON_FILE',
          'CR_MEDICATION_LIST_ON_FILE','CR_CARE_DOCUMENTATION_CURRENT','CR_SUPERVISORY_VISIT_RECORDED',
          'CR_SIGNIFICANT_EVENTS_DOCUMENTED','CR_DISCHARGE_SUMMARY_ON_FILE'],
    pr.requirement_code
  )
from public.requirement_sets rs
cross join public.person_requirements pr
where rs.set_code = 'CLIENT_RECORD_READINESS'
  and pr.requirement_code in (
    'CR_CLIENT_PROFILE_ON_FILE','CR_ASSESSMENT_CURRENT','EP_CLIENT_TRIAGE_CLASSIFIED',
    'CR_ISP_ON_FILE_AND_CURRENT','CR_SERVICE_AGREEMENT_AND_DISCLOSURE_SIGNED','CR_BILLING_AGREEMENT_ON_FILE',
    'CR_MEDICATION_LIST_ON_FILE','CR_CARE_DOCUMENTATION_CURRENT','CR_SUPERVISORY_VISIT_RECORDED',
    'CR_SIGNIFICANT_EVENTS_DOCUMENTED','CR_DISCHARGE_SUMMARY_ON_FILE'
  )
on conflict (requirement_set_id, requirement_id) do nothing;

commit;
