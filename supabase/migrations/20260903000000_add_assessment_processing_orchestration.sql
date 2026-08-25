-- Native Serve OS Assessment Capture — background processing orchestration state.
-- NOT YET APPLIED (written for review; do not run without separate authorization, per
-- standing convention on this branch).
--
-- Builds on 20260902060000_add_assessment_session_failure_state.sql (also unapplied), which
-- added status='failed' plus failure_stage/failure_reason/failed_at. That migration answers
-- "did processing fail, and why" but nothing yet answers "what is the system doing with this
-- assessment RIGHT NOW" at a granularity finer than the existing status column — needed once
-- transcription+extraction move out of the synchronous Finish request and into a background
-- worker that advances a session one step per invocation (see this scope's completion report,
-- §5 "Background orchestration").
--
-- Deliberately does NOT add new public status values beyond what 20260902060000 already
-- defined. "processing_stage" is a finer-grained, purely-descriptive column layered under the
-- existing status='processing' — never itself gates authorization or review-page branching
-- (sessionStatus remains the single source of truth for that). Cleared to null once a session
-- leaves 'processing' (success -> draft/needs_review, failure -> failed) so a stale stage value
-- never lingers on a terminal row.

begin;

alter table public.intake_assessment_sessions
  add column if not exists processing_stage text,
  add column if not exists processing_attempt_count integer not null default 0;

alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_processing_stage_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_processing_stage_check
  check (
    processing_stage is null
    or processing_stage in ('audio_finalization', 'transcription_staging', 'transcribing', 'transcript_persisted', 'extracting')
  );

-- Job-identity tracking lives on intake_sources (the audio source row), mirroring where
-- transcript_text already lives — a background worker tick reads/writes these to resume an
-- in-flight AWS Transcribe job without starting a duplicate one, and to know what to clean up
-- in S3 once the job completes or fails. Nullable and provider-agnostic: a synchronous provider
-- (OpenAI) never populates transcription_job_id because its transcription completes within a
-- single worker tick and never needs to be resumed.
alter table public.intake_sources
  add column if not exists transcription_provider text,
  add column if not exists transcription_job_id text,
  add column if not exists transcription_provider_metadata jsonb;

commit;
