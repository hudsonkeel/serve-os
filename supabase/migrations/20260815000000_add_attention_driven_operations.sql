begin;

-- Attention-Driven Operations (Phase 1C) — a product/UI phase on top of
-- the already-shipped Employee Record Audit engine. Per explicit
-- instruction: no new architectural primitives, no engine redesign. The
-- only two schema changes this phase needs are additive: one new
-- action_type value (the product now surfaces "Verify X" as a legitimate
-- Next Best Action, which Phase 1B deliberately did not generate an
-- action for) and a data recategorization (no schema change at all) so
-- the four operational categories the product now uses — Employment,
-- Registry, Training, Documentation — have a real fourth bucket.

-- ─── 1. Widen workforce_compliance_actions for "Waiting" ──────────────────
-- Phase 1B's own reasoning ("a duplicate 'please verify this' action
-- would be recommendation fatigue, since the evidence is already visible
-- on its own card") assumed the roster would never need to represent
-- "Waiting" as a first-class attention state. It now does — an employee
-- whose only open issue is unverified evidence must show as Waiting with
-- a real Next Best Action ("Verify Form I-9"), not silently as "no action
-- required." This does not reverse Phase 1B's evidence-visibility point;
-- it adds the one missing action type at the lowest priority tier.
alter table public.workforce_compliance_actions
  drop constraint if exists workforce_compliance_actions_type_check;

alter table public.workforce_compliance_actions
  add constraint workforce_compliance_actions_type_check
  check (action_type in (
    'evidence_missing', 'evidence_expired', 'evidence_expiring_soon',
    'evidence_requires_review', 'evidence_awaiting_verification'
  ));

-- ─── 2. Recategorize Viventium documents into their own bucket ───────────
-- A data value change, not a schema change — the product's four
-- operational categories (Employment / Registry / Training /
-- Documentation) need a real fourth bucket; Viventium's signed-document
-- checklist is the one requirement that fits "Documentation" rather than
-- "Employment and Identity" specifically.
update public.person_requirements
set category = 'documentation'
where requirement_code = 'VIVENTIUM_DOCS_COMPLETE';

commit;
