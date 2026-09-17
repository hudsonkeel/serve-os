begin;

-- Minimal first-party observability for the async assessment-extraction handoff (2026-09-16
-- follow-up). Netlify's current UI has no historical log for Background Functions, and the
-- admin manual trigger runs the same dispatcher logic through a Server Action, so neither the
-- Scheduled Function's nor any function's historical log is reliable evidence for a given
-- invocation. This is deliberately NOT a general logging platform: one nullable "how far did
-- the most recent attempt get" marker per session, overwritten each attempt, not an append-only
-- event log.
--
-- Claim success, extraction success, and failure are already fully derivable from existing
-- columns (status='processing' AND processing_claimed_at IS NOT NULL; status IN ('draft',
-- 'needs_review'); status='failed' + failure_reason/failed_at) -- no new field needed for those.
-- This adds only the stages that are otherwise invisible: the dispatcher selecting/invoking a
-- session, and the worker actually receiving it and starting extraction.
alter table public.intake_assessment_sessions
  add column if not exists processing_diagnostic_stage text,
  add column if not exists processing_diagnostic_stage_at timestamptz;

alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_processing_diagnostic_stage_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_processing_diagnostic_stage_check
  check (
    processing_diagnostic_stage is null
    or processing_diagnostic_stage in ('dispatched', 'invocation_accepted', 'worker_received', 'extraction_started')
  );

commit;
