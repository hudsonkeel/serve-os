-- Native Serve OS Assessment Capture — failure/retry state. NOT YET APPLIED (written for
-- review; do not run without separate authorization, per standing convention on this branch).
--
-- Fixes a real, previously-identified gap: intake_assessment_sessions has no way to represent
-- "transcription or extraction failed" — a failure today leaves the session silently stuck at
-- 'processing' forever, with no explanation visible to anyone. This migration adds exactly one
-- new status value plus three nullable, purely-descriptive columns — no existing row's meaning
-- changes, no existing status value is removed.
--
-- Same additive, idempotent-replay-safe pattern as every other status-widening migration in
-- this series (drop constraint if exists, then add).
--
-- CORRECTION (2026-08-16, AWS Synthetic Assessment Deployment Preflight): the first version of
-- this migration dropped 'operationalized' from the allowed status list — an already-applied
-- migration (20260901000000_create_assessment_intelligence_layer.sql) had widened the
-- constraint to include it, and it is live, actively-written (generateAxisCarePreview(),
-- makeActiveClientFromAssessment()) and read by the UI. Replacing the constraint with a list
-- that omitted it would have either failed outright (if any row already carries that status) or
-- silently made it impossible to ever set again. Restored below — this migration's status list
-- is now a strict superset of what's already live, adding only 'failed'.

begin;

alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_status_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_status_check
  check (status in ('recording', 'processing', 'failed', 'draft', 'needs_review', 'approved', 'amended', 'operationalized'));

alter table public.intake_assessment_sessions
  add column if not exists failure_stage text,
  add column if not exists failure_reason text,
  add column if not exists failed_at timestamptz;

alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_failure_stage_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_failure_stage_check
  check (failure_stage is null or failure_stage in ('transcription', 'extraction'));

-- Failure metadata is only ever meaningful together with status = 'failed' — mirrors the same
-- bidirectional discipline used throughout this schema (e.g. person_evidence's verification
-- fields, workforce_compliance_actions' resolution fields).
alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_failure_fields_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_failure_fields_check
  check (
    (status <> 'failed' and failure_stage is null and failed_at is null)
    or (status = 'failed' and failure_stage is not null and failed_at is not null)
  );

commit;
