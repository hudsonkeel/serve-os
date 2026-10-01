begin;

-- Assessment Mobile Capture v0.1 (Capture-Only Slice, 2026-09-30): adds one new durable session
-- status, 'captured' -- "audio capture is complete and durably stored in the private intake-audio
-- bucket, but transcription has not begun."
--
-- Why a new status rather than 'queued': the existing asynchronous processing queue
-- (getQueuedSessionsForDispatch / claimSessionForProcessing) selects status = 'queued' and runs
-- TEXT extraction over the session's transcript. A native audio-only session has no transcript
-- yet; queuing it would extract zero facts and leave an empty 'draft'. Deploy previews and
-- production share this database and production's scheduled dispatcher runs every two minutes,
-- so 'captured' must be invisible to that queue by construction: nothing selects it, nothing
-- claims it, and stale recovery only ever looks at 'processing'.
--
-- Purely additive: widens the status check constraint by exactly one value. Every status the
-- live constraint allowed before this migration (verified 2026-09-29 preflight:
-- recording, queued, processing, failed, draft, needs_review, approved, amended,
-- operationalized) is preserved exactly. No row, column, or other constraint is touched --
-- including the legacy failure_stage / processing_stage / processing_stage_entered_at columns
-- and intake_sources.transcription_* columns already present in the live database.
-- Idempotent-replay-safe (drop if exists, then add), matching
-- 20260916000000_add_assessment_processing_queue.sql.

alter table public.intake_assessment_sessions
  drop constraint if exists intake_assessment_sessions_status_check;

alter table public.intake_assessment_sessions
  add constraint intake_assessment_sessions_status_check
  check (status in ('recording', 'captured', 'queued', 'processing', 'failed', 'draft', 'needs_review', 'approved', 'amended', 'operationalized'));

commit;
