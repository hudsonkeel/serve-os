-- Native Serve OS Assessment Capture — processing-stage lease tracking. NOT YET APPLIED
-- (written for review; do not run without separate authorization, per standing convention on
-- this branch).
--
-- Follows 20260903000000_add_assessment_processing_orchestration.sql (also unapplied), which
-- added `processing_stage`. This migration adds exactly one nullable timestamp column so the
-- background stage worker can tell "this session is genuinely stuck and safe to restart" apart
-- from "another invocation is legitimately still working on it right now."
--
-- WHY THIS IS NEEDED NOW (dispatcher/background-function split, 2026-08-15 hardening pass):
-- once the bounded stage work (audio assembly, S3 staging, AWS Transcribe job start) moved into
-- a Background Function that can legitimately run for real wall-clock time, the window between
-- "claimed the transcribing stage" and "persisted the resulting job id" grew from
-- near-instantaneous to potentially minutes. A second dispatcher tick firing in that window sees
-- the same session still sitting at status='processing', processing_stage='transcribing' with no
-- job id yet — indistinguishable, by stage name alone, from a genuinely abandoned attempt. A
-- lease timestamp lets that recovery path require the stage to have been entered more than a few
-- minutes ago before treating it as abandoned and safe to restart, rather than always treating a
-- missing job id as immediately restartable (which could start a second, duplicate AWS
-- Transcribe job and orphan the first one's S3 objects).

begin;

alter table public.intake_assessment_sessions
  add column if not exists processing_stage_entered_at timestamptz;

commit;
