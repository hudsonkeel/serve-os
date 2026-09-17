begin;

-- Asynchronous assessment-extraction queue (2026-09-16). Fixes a real, observed failure: a
-- pasted-transcript "Extract Facts" submission ran extraction synchronously inside the request
-- that created the session, so a slow provider call (or a platform function timeout) could
-- strand the browser and leave the session at status='processing' forever, with no failure
-- state, no retry, and no stored reason. This migration adds exactly what a bounded,
-- explicit-failure, idempotent-retry queue needs -- nothing audio/AWS-specific (no processing
-- stages, no job-id tracking; extraction is one bounded step, unlike native-audio transcription).
--
-- Modeled on (not copied from) the equivalent, previously-reviewed migration on
-- feature/assessment-aws-transcription-pipeline
-- (20260902370000_add_assessment_session_failure_state.sql) -- same additive,
-- idempotent-replay-safe pattern (drop constraint if exists, then add), same bidirectional
-- failure-fields discipline, deliberately without that branch's multi-stage/AWS-specific
-- columns this slice doesn't need.

-- 'queued': transcript/source durably saved, not yet claimed by a background worker.
-- 'failed': processing was attempted and did not succeed (bounded retry, see below) --
-- distinct from silently stuck at 'processing' forever, which is the bug this exists to fix.
alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_status_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_status_check
  check (status in ('recording', 'queued', 'processing', 'failed', 'draft', 'needs_review', 'approved', 'amended', 'operationalized'));

-- processing_attempt_count: incremented each time a background worker claims this session
-- (queued -> processing). Governs the bounded-retry policy -- both automatic stale-processing
-- recovery and manual operator retry refuse to re-queue a session at or past the cap, so a
-- session eventually reaches 'failed' permanently rather than retrying indefinitely.
--
-- processing_claimed_at: set at claim time (queued -> processing). Lets automatic recovery
-- distinguish "a worker is genuinely still within its normal execution window" from "the last
-- claimed worker never came back" (crashed, or was killed by a platform timeout) -- the same
-- distinction processing_stage_entered_at existed for on the AWS branch, without needing a
-- multi-stage model here.
--
-- failure_reason / failed_at: administrator/debugging detail only -- the operator-facing UI
-- never renders failure_reason directly (see safeFailureMessage() in processingQueue.ts).
alter table public.intake_assessment_sessions
  add column if not exists processing_attempt_count integer not null default 0,
  add column if not exists processing_claimed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists failed_at timestamptz;

-- Failure metadata is only ever meaningful together with status = 'failed' -- same bidirectional
-- discipline used elsewhere in this schema (assessment_fact_conflicts' resolution fields,
-- person_evidence's verification fields): a database-level guarantee, not just an application
-- convention, that 'failed' can never mean "no reason recorded" and a reason can never linger on
-- a session that isn't actually failed.
alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_failure_fields_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_failure_fields_check
  check (
    (status = 'failed') = (failed_at is not null and failure_reason is not null)
  );

commit;
