-- Emergency Preparedness Activation — Phase B, Migration 3 of 3.
--
-- The Annual Review mechanism. Materially different from the Audit Drill
-- (audit_sessions/audit_session_items) and deliberately NOT built on top of
-- it: the Audit Drill only ever records findings about pre-existing
-- evidence from a third-party-auditor stance and must never write new
-- canonical domain evidence itself. The Annual Review IS the
-- evidence-producing event for Emergency Preparedness's own domain —
-- completing a review item can create a new person_evidence row. The two
-- outcome vocabularies don't overlap cleanly either (no_change_needed/
-- update_needed/evidence_needed/needs_review vs pass/fail/evidence_missing/
-- needs_review). So this is new, minimal, purpose-built infrastructure
-- reusing every existing piece it can (evidence creation, the
-- completion-lock trigger pattern already proven by
-- assert_audit_session_not_completed()) without reusing the Audit Drill
-- table itself.
--
-- Same completion-lock discipline as audit_session_items: a review is
-- freely editable while in_progress; completing it is the one RPC that can
-- transition it, at which point a trigger makes its items structurally
-- immutable. Correction Mode for a completed review does not exist yet —
-- flagged as required hardening before completed reviews are relied upon as
-- durable operational records, same philosophy as audit_session_corrections,
-- not built in this pass.
--
-- Also widens compliance_activity.event_type (idempotent drop/add, same
-- pattern as every prior widening in this series) so EP_HHS_NOTIFICATION's
-- applicability can be backed by a real event record — never
-- evidence-absence — rather than an invented calendar interval.
--
-- SAFETY REVIEW: two net-new tables, one net-new trigger, one net-new RPC.
-- Only compliance_activity's existing CHECK constraint is touched, and only
-- to WIDEN its allow-list — every row that satisfied the old constraint
-- still satisfies the new one. RLS enabled + zero policies +
-- service_role-only grants throughout, matching every other table in this
-- schema.
--
-- ROLLBACK:
--
--   drop trigger if exists check_emergency_preparedness_review_not_completed on emergency_preparedness_review_items;
--   drop function if exists assert_emergency_preparedness_review_not_completed();
--   drop function if exists complete_emergency_preparedness_review(uuid, text, text);
--   drop table if exists emergency_preparedness_review_items;
--   drop table if exists emergency_preparedness_reviews;
--   alter table compliance_activity drop constraint if exists compliance_activity_event_type_check;
--   alter table compliance_activity add constraint compliance_activity_event_type_check
--     check (event_type in (
--       'corrective_action_created', 'corrective_action_resolved', 'corrective_action_dismissed',
--       'requirement_evidence_link_created', 'audit_session_started', 'audit_session_item_recorded',
--       'audit_session_completed'
--     ));
--
-- NOT YET APPLIED — pending explicit approval, per standing instruction.

begin;

create table if not exists emergency_preparedness_reviews (
  id             uuid primary key default gen_random_uuid(),

  review_type    text not null default 'annual',
  status         text not null default 'in_progress',
  reviewer       text not null,
  summary        text,

  started_at     timestamptz not null default now(),
  completed_at   timestamptz,

  constraint emergency_preparedness_reviews_review_type_check
    check (review_type in ('annual')),
  constraint emergency_preparedness_reviews_status_check
    check (status in ('in_progress', 'completed')),
  constraint emergency_preparedness_reviews_reviewer_not_blank
    check (length(trim(reviewer)) > 0),
  constraint emergency_preparedness_reviews_completion_check
    check (
      (status <> 'completed' and completed_at is null)
      or (status = 'completed' and completed_at is not null)
    )
);

create index if not exists emergency_preparedness_reviews_status_idx
  on emergency_preparedness_reviews (status, started_at desc);

alter table emergency_preparedness_reviews enable row level security;
revoke all on emergency_preparedness_reviews from public, anon, authenticated;
grant all on emergency_preparedness_reviews to service_role;

create table if not exists emergency_preparedness_review_items (
  id                    uuid primary key default gen_random_uuid(),

  review_id             uuid not null references public.emergency_preparedness_reviews(id),
  item_kind             text not null,

  -- requirement_finding only. Null for a pure improvement not tied to one
  -- requirement.
  requirement_id        uuid references public.person_requirements(id) on delete no action,
  outcome               text,
  -- Set when the outcome produced fresh evidence (see
  -- lib/emergencyPreparedness/emergencyPreparednessReviews.ts for which
  -- outcomes do vs. don't — a requirement satisfied by continued existence
  -- rather than a calendar, e.g. EP_PLAN_MAINTAINED, records a
  -- no_change_needed finding here with no resulting evidence row at all,
  -- since nothing about it expires).
  resulting_evidence_id uuid references public.person_evidence(id) on delete no action,

  -- improvement only.
  description           text,

  notes                 text,
  created_by            text not null,
  created_at            timestamptz not null default now(),

  constraint emergency_preparedness_review_items_kind_check
    check (item_kind in ('requirement_finding', 'improvement')),
  constraint emergency_preparedness_review_items_outcome_check
    check (outcome is null or outcome in ('no_change_needed', 'update_needed', 'evidence_needed', 'needs_review')),
  constraint emergency_preparedness_review_items_created_by_not_blank
    check (length(trim(created_by)) > 0),
  constraint emergency_preparedness_review_items_finding_shape
    check (item_kind <> 'requirement_finding' or (requirement_id is not null and outcome is not null)),
  constraint emergency_preparedness_review_items_improvement_shape
    check (item_kind <> 'improvement' or description is not null)
);

create index if not exists emergency_preparedness_review_items_review_idx
  on emergency_preparedness_review_items (review_id, created_at);

alter table emergency_preparedness_review_items enable row level security;
revoke all on emergency_preparedness_review_items from public, anon, authenticated;
grant all on emergency_preparedness_review_items to service_role;

-- Once a review is completed, its items are structurally immutable — the
-- same "reopen and see exactly what was reviewed" guarantee
-- assert_audit_session_not_completed() already gives the Audit Drill.
create or replace function assert_emergency_preparedness_review_not_completed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.emergency_preparedness_reviews where id = new.review_id;

  if v_status is null then
    raise exception 'emergency_preparedness_review % does not exist', new.review_id;
  end if;

  if v_status = 'completed' then
    raise exception 'emergency_preparedness_review % is completed — its items are immutable', new.review_id;
  end if;

  return new;
end;
$$;

drop trigger if exists check_emergency_preparedness_review_not_completed on emergency_preparedness_review_items;
create trigger check_emergency_preparedness_review_not_completed
  before insert or update on emergency_preparedness_review_items
  for each row execute function assert_emergency_preparedness_review_not_completed();

create or replace function complete_emergency_preparedness_review(
  p_review_id uuid,
  p_summary text,
  p_actor text
)
returns public.emergency_preparedness_reviews
language plpgsql
set search_path = public
as $$
declare
  v_result public.emergency_preparedness_reviews%rowtype;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'An authenticated actor is required to complete an Emergency Preparedness review';
  end if;

  update public.emergency_preparedness_reviews
  set status = 'completed', completed_at = now(), summary = p_summary
  where id = p_review_id and status <> 'completed'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Emergency Preparedness review % not found or already completed', p_review_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function complete_emergency_preparedness_review(uuid, text, text) from public;
grant execute on function complete_emergency_preparedness_review(uuid, text, text) to service_role;

-- EP_HHS_NOTIFICATION's applicability, per §256's HHS notification clause,
-- must be backed by a real recorded event — never inferred from the
-- absence of evidence. Widened the same idempotent drop/add way every
-- other subject_type/event_type CHECK in this migration series has been.
alter table compliance_activity drop constraint if exists compliance_activity_event_type_check;
alter table compliance_activity add constraint compliance_activity_event_type_check
  check (event_type in (
    'corrective_action_created',
    'corrective_action_resolved',
    'corrective_action_dismissed',
    'requirement_evidence_link_created',
    'audit_session_started',
    'audit_session_item_recorded',
    'audit_session_completed',
    'agency_temporary_relocation',
    'agency_service_area_expansion'
  ));

commit;
