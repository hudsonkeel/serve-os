begin;

-- Extends the diagnostic-stage model (20260916010000_add_assessment_processing_diagnostics.sql,
-- 20260917000000_add_worker_wrapper_started_diagnostic_stage.sql) with the outcome of the
-- standalone Netlify background-worker wrapper's
-- (netlify/functions/assessment-processing-stage-worker-background.mts) own outbound fetch to
-- the protected Next.js worker Route Handler.
--
-- Added 2026-09-17 after a live test showed all 11 dispatched sessions reaching
-- 'worker_wrapper_started' -- proving the wrapper's handler body itself starts executing after
-- Netlify's 202 acknowledgment -- and none reaching 'worker_received', with no way to tell
-- whether the wrapper's own fetch() ever completed, was rejected (a real HTTP response, just not
-- a 2xx), or never got a response at all (thrown/timed out).
--
-- One new stage, 'worker_wrapper_fetch_failed', covers both cases (the fetch didn't lead to
-- forwarding a genuine 2xx onward) -- paired with the new processing_diagnostic_wrapper_fetch_
-- status column below for exactly which case: NULL means no HTTP response was ever received
-- (network/DNS/timeout); a value means a real response came back with that status code (401,
-- 404, 500, etc). This is a bounded HTTP status integer, never response bodies, exception
-- messages, URLs, headers, or provider errors -- deliberately the smallest safe code that lets
-- one live test distinguish every case the 2026-09-17 investigation asked for, without needing a
-- further migration merely to add more resolution to an already-covered failure mode.
alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_processing_diagnostic_stage_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_processing_diagnostic_stage_check
  check (
    processing_diagnostic_stage is null
    or processing_diagnostic_stage in (
      'dispatched',
      'invocation_accepted',
      'worker_wrapper_started',
      'worker_wrapper_fetch_failed',
      'worker_received',
      'extraction_started'
    )
  );

alter table public.intake_assessment_sessions
  add column if not exists processing_diagnostic_wrapper_fetch_status smallint;

alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_wrapper_fetch_status_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_wrapper_fetch_status_check
  check (
    processing_diagnostic_wrapper_fetch_status is null
    or (processing_diagnostic_wrapper_fetch_status >= 100 and processing_diagnostic_wrapper_fetch_status < 600)
  );

commit;
