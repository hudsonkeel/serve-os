-- Adds a longitudinal-record label to intake_assessment_sessions (Phase 11, AxisCare end-to-end
-- scope). Purely additive: a new nullable column, no data migration, no existing row touched,
-- no existing constraint tightened. This does NOT build a diff/comparison engine — that already
-- exists in application code (lib/assessmentIntelligence/reassessmentComparison.ts), reading the
-- already-chronological, already-resident-scoped assessment_approved_facts table (with its
-- existing supersedes_fact_id chain, in place since 20260901000000_create_assessment_intelligence
-- _layer.sql). What was actually missing was a way to LABEL why a given session happened, so a
-- future "Initial Assessment / 90-Day Review / Annual Assessment / Change in Condition" view has
-- something to group/filter by. Nullable and unconstrained-by-default: existing sessions (and
-- any session that doesn't specify a type) are simply unlabeled, never guessed.

alter table public.intake_assessment_sessions
  add column if not exists assessment_type text;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_assessment_type_check
  check (
    assessment_type is null
    or assessment_type in (
      'initial',
      '30_day_review',
      '60_day_review',
      '90_day_review',
      'annual_review',
      'post_hospital',
      'change_in_condition',
      'family_requested',
      'internal_care_plan_review',
      'other'
    )
  );

comment on column public.intake_assessment_sessions.assessment_type is
  'Optional label for why this assessment happened (Phase 11, AxisCare end-to-end scope). Never inferred — set explicitly by whoever initiates the session, or left null. Purely descriptive: reassessmentComparison.ts does not read this column, it reads assessment_approved_facts directly regardless of type.';
