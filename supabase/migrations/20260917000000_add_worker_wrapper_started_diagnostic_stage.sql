begin;

-- Extends the diagnostic-stage model (20260916010000_add_assessment_processing_diagnostics.sql)
-- with one more stage: proof that the standalone Netlify background-worker wrapper
-- (netlify/functions/assessment-processing-stage-worker-background.mts) itself started
-- executing after Netlify's 202 background-function acknowledgment, before it attempts to
-- forward the request to the protected Next.js worker Route Handler.
--
-- Added 2026-09-17 after a second live dispatch test (run after the server-only import fix,
-- commit ef4cdfc) again showed every eligible session reaching 'invocation_accepted' and none
-- reaching 'worker_received' -- with no way to tell whether the .mts wrapper's handler body ever
-- actually ran, since that file cannot import lib/ code (including the shared
-- recordProcessingDiagnosticStage() helper) without reintroducing the original server-only
-- crash. Written directly via a raw PostgREST PATCH from within the .mts wrapper itself (see
-- that file's recordWrapperStarted()), not through the application data layer.
alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_processing_diagnostic_stage_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_processing_diagnostic_stage_check
  check (
    processing_diagnostic_stage is null
    or processing_diagnostic_stage in (
      'dispatched', 'invocation_accepted', 'worker_wrapper_started', 'worker_received', 'extraction_started'
    )
  );

commit;
