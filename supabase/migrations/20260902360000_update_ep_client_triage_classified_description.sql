-- Corrects EP_CLIENT_TRIAGE_CLASSIFIED's description, which described a
-- 4-level triage system per the original P&P draft. Production AxisCare
-- data (the account's actual Client Profile Triage Level picklist)
-- confirms the real, currently-used system is 3 levels (Priority 1/2/3 —
-- High/Moderate/Low Continuity Need); two other picklist values present on
-- old records ("Can get out on their own" / "Need assistance or
-- reminding") are a different, unrelated legacy field, not additional
-- triage levels. Text only — requirement_code/id untouched. Safe as a
-- plain UPDATE: confirmed via hasRequirementBeenReliedUponInCompletedAudit
-- (lib/data/personRequirements.ts) that this requirement has never been
-- relied upon in a completed audit session as of this migration.
update person_requirements
set description = 'A recorded emergency triage classification (Priority 1 -- High Continuity Need, Priority 2 -- Moderate Continuity Need, or Priority 3 -- Low Continuity Need) is on file for the client, matching AxisCare''s own Client Profile Triage Level classification.'
where requirement_code = 'EP_CLIENT_TRIAGE_CLASSIFIED';

-- ROLLBACK:
--
--   update person_requirements
--   set description = 'A completed, signed Emergency Preparedness Classification Assessment (4-level triage) is on file for the client.'
--   where requirement_code = 'EP_CLIENT_TRIAGE_CLASSIFIED';
