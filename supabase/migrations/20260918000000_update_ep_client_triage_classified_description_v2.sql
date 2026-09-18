-- Corrects EP_CLIENT_TRIAGE_CLASSIFIED's description again, following
-- 20260902360000's own precedent and safety discipline. That migration
-- updated the description to reflect AxisCare's then-current Priority
-- 1/2/3 -- High/Moderate/Low Continuity Need vocabulary. AxisCare has
-- since relabeled its Client Profile Triage Level picklist, and Serve is
-- standardizing its own canonical baseline-classification vocabulary to
-- match it exactly (approved 2026-09-18, alongside the triage
-- canonical-source-gap repair): Enhanced Support / Moderate Support /
-- Lower Support / Independent. Persisted governed codes (P1/P2/P3 in
-- resident_triage_classifications.level_code) are UNCHANGED -- this is a
-- description-text-only correction, matching 20260902360000's own scope.
--
-- Text only — requirement_code/id untouched. MUST be confirmed safe as a
-- plain UPDATE before this migration is applied to production, the same
-- way 20260902360000 was: run
--   hasRequirementBeenReliedUponInCompletedAudit(requirementId)
-- (lib/data/personRequirements.ts) for EP_CLIENT_TRIAGE_CLASSIFIED and
-- confirm it returns false. If it returns true, this must go through
-- supersedePersonRequirement() instead of a plain UPDATE — do not apply
-- this file as-is in that case.
update person_requirements
set description = 'A recorded emergency triage classification (Enhanced Support, Moderate Support, or Lower Support / Independent) is on file for the client, matching AxisCare''s own Client Profile Triage Level classification.'
where requirement_code = 'EP_CLIENT_TRIAGE_CLASSIFIED';

-- ROLLBACK:
--
--   update person_requirements
--   set description = 'A recorded emergency triage classification (Priority 1 -- High Continuity Need, Priority 2 -- Moderate Continuity Need, or Priority 3 -- Low Continuity Need) is on file for the client, matching AxisCare''s own Client Profile Triage Level classification.'
--   where requirement_code = 'EP_CLIENT_TRIAGE_CLASSIFIED';
