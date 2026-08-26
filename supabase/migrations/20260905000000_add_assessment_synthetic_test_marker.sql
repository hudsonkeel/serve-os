-- Native Serve OS Assessment Capture — explicit session-level synthetic-test identity.
-- NOT YET APPLIED (written for review; do not run without separate authorization, per standing
-- convention on this branch).
--
-- Why this exists (2026-08-16, AWS Synthetic Assessment Deployment Preflight): the real
-- dispatcher/background-worker AWS processing path needs a way to safely exercise AWS Transcribe
-- with synthetic (fabricated, non-PHI) audio without setting PHI_AWS_PROCESSING_CONFIRMED=true —
-- that flag is a broad, environment-wide production attestation and must never be used as
-- authorization for one arbitrary test session. This column is the alternative: a durable,
-- per-session, explicit marker. It is never inferred (not from a resident's name, not from
-- anything else) — the only code path that ever sets it true is the admin-only
-- createSyntheticAssessmentSession() action (lib/actions/assessmentProcessingAdmin.ts). See
-- lib/assessmentIntelligence/pipeline.ts's isSessionAuthorizedForConfiguredTranscriptionProvider()
-- for how this is actually used to gate AWS processing per-session.
--
-- Smallest appropriate schema: a single boolean, defaulting false, on the session row itself
-- (not on intake_sources — the worker already loads the session for every stage transition, so
-- no extra join is needed). Deliberately NOT a text "marker" column in the style of
-- relationships.test_marker (docs/engineering/TEST_DATA_HYGIENE.md) — that convention exists to
-- support a governed bulk-cleanup script keyed by marker value, which is explicitly out of scope
-- here; a plain boolean is sufficient for "is this session identifiable as synthetic," which is
-- all this scope requires. A future governed-cleanup pass can add a marker-style column then, if
-- actually needed.

begin;

alter table public.intake_assessment_sessions
  add column if not exists is_synthetic_test boolean not null default false;

comment on column public.intake_assessment_sessions.is_synthetic_test is
  'True only for a session explicitly created via the admin-only synthetic-test path (createSyntheticAssessmentSession) to validate the AWS Transcribe/Bedrock pipeline with fabricated, non-PHI audio. Never inferred from a resident''s name or any other heuristic. Session-scoped: marking one session synthetic has no effect on any other session — see pipeline.ts''s isSessionAuthorizedForConfiguredTranscriptionProvider().';

commit;
