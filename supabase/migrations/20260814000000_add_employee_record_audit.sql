begin;

-- Employee Record Audit — the first complete product built on the
-- already-resolved intelligence architecture. Per explicit instruction:
-- reuse the existing evidence/requirement architecture exactly as it
-- stands (no HistoricalFact migration, no generalized governance-assets
-- spine, no Case/Workflow/Collector tables). The only genuinely new
-- structure this phase needs is the operational-work layer ("Action
-- Generation") — everything else is new reference data plus two narrow,
-- additive columns.
--
-- Additive only. Does not touch any prior workforce migration.

-- ─── 1. Score-gated requirements (HIPAA/HB300, Infection Control) ────────
-- Two narrow, additive columns — not a redesign of the evidence model.
-- required_score is reference data (a property of the requirement);
-- numeric_score is the evidence fact it's checked against. Both nullable:
-- unused by every requirement that isn't score-gated (the other nine).
alter table public.person_requirements
  add column if not exists required_score numeric;

alter table public.person_evidence
  add column if not exists numeric_score numeric;

-- ─── 2. Employee Record Audit requirement catalog ─────────────────────────
-- Categories match the product's own Employment & Identity / Registry &
-- Eligibility / Training & Competency grouping. NAR/EMR are NOT
-- re-inserted here — they already exist (TX_NAR_SEARCH/TX_EMR_SEARCH,
-- 20260808000000) and are reused by reference in the requirement_set_members
-- insert below. Recommended/best-practice profile items (attributes,
-- availability, photo, preferred hours) are deliberately NOT included in
-- this pass — they read from AxisCare source data, not person_evidence, and
-- would require a second evaluation pathway this phase doesn't need yet.
insert into public.person_requirements
  (requirement_code, name, description, category, requires_document, requires_verification, required_score)
values
  ('VIVENTIUM_DOCS_COMPLETE', 'Viventium Documents Complete', 'All required Viventium-managed personnel documents are on file and signed.', 'employment_identity', true, true, null),
  ('I9_COMPLETION', 'Form I-9 Completed', 'Identity documents physically reviewed and Form I-9 completed.', 'employment_identity', true, true, null),
  ('BACKGROUND_AUTHORIZATION_SIGNED', 'Background Check Authorization Signed', 'Signed authorization to run a background investigation is on file.', 'employment_identity', true, true, null),
  ('BACKGROUND_CHECK_RESULT', 'Background Check Completed', 'Background check completed and employment requirements satisfied.', 'employment_identity', true, true, null),
  ('E_VERIFY_COMPLETION', 'E-Verify Completed', 'E-Verify completed and employment eligibility confirmed.', 'employment_identity', true, true, null),
  ('REFERENCE_CHECKS', 'Reference Checks Completed', 'Required reference checks completed and retained.', 'registry_eligibility', true, true, null),
  ('SKILLS_SELF_ASSESSMENT', 'Skills Self-Assessment Completed', 'Skills self-assessment completed and reviewed with the employee.', 'training_competency', true, true, null),
  -- required_score default (80) is a shipped, sensible placeholder — not an
  -- adopted policy threshold. Flagged for explicit approval before this
  -- requirement is relied upon to block anyone from working; see the
  -- accompanying report.
  ('HIPAA_HB300_TRAINING', 'HIPAA / HB 300 Training', 'HIPAA and Texas HB 300 privacy training completed with the required score.', 'training_competency', true, true, 80),
  ('INFECTION_CONTROL_TRAINING', 'Infection Control Training', 'Infection control training completed with the required score.', 'training_competency', true, true, 80)
on conflict (requirement_code) do nothing;

insert into public.requirement_sets (set_code, name, description, category)
values ('WORKFORCE_EMPLOYEE_RECORD_AUDIT', 'Employee Record Audit', 'The current operational employee-record audit checklist Serve uses to confirm workforce readiness.', 'audit_checklist')
on conflict (set_code) do nothing;

insert into public.requirement_set_members (requirement_set_id, requirement_id, sort_order)
select rs.id, pr.id,
  array_position(
    array['VIVENTIUM_DOCS_COMPLETE','I9_COMPLETION','BACKGROUND_AUTHORIZATION_SIGNED','BACKGROUND_CHECK_RESULT',
          'E_VERIFY_COMPLETION','TX_NAR_SEARCH','TX_EMR_SEARCH','REFERENCE_CHECKS','SKILLS_SELF_ASSESSMENT',
          'HIPAA_HB300_TRAINING','INFECTION_CONTROL_TRAINING'],
    pr.requirement_code
  )
from public.requirement_sets rs
cross join public.person_requirements pr
where rs.set_code = 'WORKFORCE_EMPLOYEE_RECORD_AUDIT'
  and pr.requirement_code in (
    'VIVENTIUM_DOCS_COMPLETE','I9_COMPLETION','BACKGROUND_AUTHORIZATION_SIGNED','BACKGROUND_CHECK_RESULT',
    'E_VERIFY_COMPLETION','TX_NAR_SEARCH','TX_EMR_SEARCH','REFERENCE_CHECKS','SKILLS_SELF_ASSESSMENT',
    'HIPAA_HB300_TRAINING','INFECTION_CONTROL_TRAINING'
  )
on conflict (requirement_set_id, requirement_id) do nothing;

-- ─── 3. Operational work — workforce_compliance_actions ───────────────────
-- Deliberately Workforce-domain-scoped (workforce_member_id, not a
-- polymorphic subject) — this product is the only consumer today; a
-- platform-wide action table is exactly the "generalize before it's
-- needed" mistake the architecture review rejected. If a second domain
-- needs the same shape later, it generalizes then, by rename, not now, by
-- guess.
create table if not exists public.workforce_compliance_actions (
  id                  uuid primary key default gen_random_uuid(),
  workforce_member_id uuid not null references public.workforce_members(id) on delete no action,
  requirement_id      uuid references public.person_requirements(id) on delete no action,

  action_type         text not null,
  title               text not null,
  reason              text not null,
  owner               text,
  priority            text not null default 'normal',
  due_at              date,
  status              text not null default 'open',

  resolution_note     text,
  resolved_by         text,
  resolved_at         timestamptz,

  created_by          text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint workforce_compliance_actions_type_check
    check (action_type in ('evidence_missing', 'evidence_expired', 'evidence_expiring_soon', 'evidence_requires_review')),
  constraint workforce_compliance_actions_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint workforce_compliance_actions_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint workforce_compliance_actions_title_not_blank
    check (length(trim(title)) > 0),
  constraint workforce_compliance_actions_created_by_not_blank
    check (length(trim(created_by)) > 0),
  constraint workforce_compliance_actions_resolution_fields_check
    check (
      (status = 'open' and resolved_by is null and resolved_at is null)
      or (status <> 'open' and resolved_by is not null and resolved_at is not null)
    )
);

-- The idempotency guarantee: re-evaluating readiness twice in a row (or on
-- every page load) must never create a second open action for the same
-- unresolved problem — Acceptance Scenario G, made structural.
create unique index if not exists workforce_compliance_actions_one_open_per_issue_idx
  on public.workforce_compliance_actions (workforce_member_id, requirement_id, action_type)
  where status = 'open';

create index if not exists workforce_compliance_actions_status_idx
  on public.workforce_compliance_actions (status, due_at);

alter table public.workforce_compliance_actions enable row level security;
revoke all on public.workforce_compliance_actions from public, anon, authenticated;
grant all on public.workforce_compliance_actions to service_role;

-- Upsert-by-issue: creates the action if none is open for this
-- (member, requirement, action_type); otherwise refreshes its title/
-- reason/priority/due date in place rather than creating a duplicate.
create or replace function sync_workforce_compliance_action(
  p_workforce_member_id uuid,
  p_requirement_id uuid,
  p_action_type text,
  p_title text,
  p_reason text,
  p_priority text,
  p_due_at date,
  p_actor text
)
returns public.workforce_compliance_actions
language plpgsql
set search_path = public
as $$
declare
  v_existing public.workforce_compliance_actions%rowtype;
  v_result public.workforce_compliance_actions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An actor is required to sync a compliance action';
  end if;

  select * into v_existing
  from public.workforce_compliance_actions
  where workforce_member_id = p_workforce_member_id
    and requirement_id is not distinct from p_requirement_id
    and action_type = p_action_type
    and status = 'open'
  for update;

  if found then
    update public.workforce_compliance_actions
    set title = p_title, reason = p_reason, priority = p_priority, due_at = p_due_at, updated_at = now()
    where id = v_existing.id
    returning * into v_result;
  else
    insert into public.workforce_compliance_actions (
      workforce_member_id, requirement_id, action_type, title, reason, priority, due_at, created_by
    ) values (
      p_workforce_member_id, p_requirement_id, p_action_type, p_title, p_reason, p_priority, p_due_at, p_actor
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke execute on function sync_workforce_compliance_action(uuid, uuid, text, text, text, text, date, text) from public;
grant execute on function sync_workforce_compliance_action(uuid, uuid, text, text, text, text, date, text) to service_role;

-- Closes every OPEN action for one (member, requirement) pair — called
-- once the requirement re-evaluates as satisfied, so a fixed problem never
-- lingers as an open action requiring manual cleanup ("readiness updates
-- automatically... no manual recalculation").
create or replace function auto_resolve_workforce_compliance_actions(
  p_workforce_member_id uuid,
  p_requirement_id uuid
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.workforce_compliance_actions
  set status = 'resolved',
      resolved_by = 'System',
      resolved_at = now(),
      resolution_note = 'Resolved automatically — the requirement now evaluates as satisfied.',
      updated_at = now()
  where workforce_member_id = p_workforce_member_id
    and requirement_id is not distinct from p_requirement_id
    and status = 'open';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function auto_resolve_workforce_compliance_actions(uuid, uuid) from public;
grant execute on function auto_resolve_workforce_compliance_actions(uuid, uuid) to service_role;

-- Human resolution/dismissal — always attributed, always a stated
-- rationale via resolution_note (required, matching every other
-- terminal-decision RPC in this schema).
create or replace function resolve_workforce_compliance_action(
  p_action_id uuid,
  p_status text,
  p_actor text,
  p_resolution_note text
)
returns public.workforce_compliance_actions
language plpgsql
set search_path = public
as $$
declare
  v_result public.workforce_compliance_actions%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to resolve a compliance action';
  end if;
  if p_resolution_note is null or length(trim(p_resolution_note)) = 0 then
    raise exception 'A resolution note is required';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  update public.workforce_compliance_actions
  set status = p_status, resolved_by = p_actor, resolved_at = now(), resolution_note = p_resolution_note, updated_at = now()
  where id = p_action_id and status = 'open'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Open compliance action % not found', p_action_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function resolve_workforce_compliance_action(uuid, text, text, text) from public;
grant execute on function resolve_workforce_compliance_action(uuid, text, text, text) to service_role;

-- ─── 4. Widen workforce_activity for the new action events ───────────────
alter table public.workforce_activity
  drop constraint if exists workforce_activity_event_type_check;

alter table public.workforce_activity
  add constraint workforce_activity_event_type_check
  check (event_type in (
    'workforce_profile_created',
    'identity_link_confirmed',
    'axiscare_source_data_refreshed',
    'document_uploaded',
    'evidence_created',
    'evidence_verified',
    'evidence_rejected',
    'evidence_superseded',
    'document_metadata_corrected',
    'document_reassigned',
    'accidental_upload_removed',
    'evidence_corrected',
    'evidence_marked_entered_in_error',
    'evidence_replaced',
    'evidence_renewed',
    'identity_link_reopened',
    'identity_link_promoted_to_primary',
    'identity_link_role_changed',
    'identity_link_subject_reassigned',
    'canonical_profile_updated',
    'canonical_profile_reviewed',
    'canonical_profile_locked',
    'canonical_profile_unlocked',
    'community_membership_updated',
    'profile_discrepancy_flagged',
    'profile_discrepancy_resolved',
    'compliance_action_created',
    'compliance_action_resolved',
    'compliance_action_dismissed'
  ));

commit;
