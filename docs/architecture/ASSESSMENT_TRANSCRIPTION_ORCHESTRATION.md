# Production Assessment Transcription Orchestration

2026-08-15. Fixes two architectural problems identified in the native Serve OS assessment
capture implementation (see `docs/architecture/BEDROCK_CLAUDE_PROVIDER.md` and
`docs/architecture/AUDIO_TRANSCRIPTION_PIPELINE.md` for the capture/transcription work this
builds on) before it can be deployed:

1. The AWS Transcribe adapter proposed one batch job per ~10-second capture chunk — 60-180 jobs
   for a real 10-30 minute assessment.
2. Finish Assessment waited synchronously for transcription + extraction inside one Next.js
   Server Action — a real timeout risk for a real assessment.

## Capture unit vs. transcription unit

Audio is still captured, uploaded, and stored as ~10-second WebM/Opus chunks — that granularity
exists for **capture durability** (crash/reload-safe incremental upload via IndexedDB) and is
untouched by this scope. It does not need to also be the **transcription unit**.

**Decision: one assembled audio file, one Transcribe job, per assessment** (not per chunk).
Chunks are downloaded and concatenated server-side via real ffmpeg remuxing (`ffmpeg-static` +
`fluent-ffmpeg`, see `lib/assessmentIntelligence/audioAssembly.ts`) — naive byte-concatenation of
independent WebM containers is unsafe and was rejected. A single assembled file:

- needs exactly one job identity to track per assessment, not up to 180
- gives AWS Transcribe the full conversational context instead of isolated 10s fragments
- fits comfortably in serverless memory/runtime (a 30-minute Opus voice recording at typical
  bitrate is roughly 5-15MB)

**Honesty note**: the ffmpeg concat path has been implemented carefully but not exercised
against real captured audio in this session (no real recording was available, and fabricating
one was out of scope) — verify against a short real recording before relying on it.

## Background orchestration

Finish Assessment (`lib/actions/assessmentCapture.ts`) now only finalizes the upload and writes
DB state (`status='processing'`, `processing_stage='transcription_staging'`) — it returns
immediately, awaiting nothing AWS-related.

### Dispatcher / Background Function split (2026-08-15 hardening pass)

Netlify Scheduled Functions have a **documented hard 30-second execution limit** — too short to
safely perform ffmpeg assembly, an S3 upload, or an AWS Transcribe/Bedrock call inside. The
original single-function design (`assessment-processing-worker.ts`, now removed) called
`advanceAssessmentProcessing()` directly, in a loop, inside the scheduled function itself — a
real risk of exceeding that limit. The orchestration is now split into two functions with
strictly separated responsibilities:

**`netlify/functions/assessment-processing-dispatcher.ts`** — a **Scheduled Function** (every 2
minutes, standard cron via `config.schedule`). Its entire job: find up to 5 eligible sessions
(`getSessionsEligibleForProcessing`) and fire an async HTTP invocation of the background stage
worker for each (`dispatchEligibleAssessmentProcessing()` in `pipeline.ts`). It never awaits AWS
work — a Background Function invocation acknowledges (~202) almost immediately, before its
handler even finishes running, so each dispatch resolves in milliseconds regardless of how long
the actual stage takes. Never performs the bounded work itself.

**`netlify/functions/assessment-processing-stage-worker-background.ts`** — a **Background
Function** (declared via `export const config: Config = { background: true }` — the current
Netlify-recommended approach, rather than relying on the legacy `-background` filename-suffix
convention Netlify still supports; the filename itself is preserved as-is purely so the route
stays identical, up to 15 minutes execution). Invoked by the dispatcher
via `POST /.netlify/functions/assessment-processing-stage-worker-background` with
`{ assessmentSessionId }` and a shared-secret header (`ASSESSMENT_PROCESSING_WORKER_SECRET`,
checked against `x-assessment-worker-secret` — these endpoints are plain reachable HTTP URLs,
nothing about "background" makes them private on its own). Calls `advanceAssessmentProcessing()`
— **unchanged** from the original design — which performs exactly one resumable stage (audio
assembly + S3 staging + starting one Transcribe job; a single Transcribe completion check +
transcript persistence; or one Bedrock extraction call) and returns. It still never
sleeps/polls waiting for AWS Transcribe to finish — that remains the dispatcher's job, one tick
at a time, across however many 2-minute cycles a real job needs. Whatever this function returns
is never delivered back to its caller (Netlify has already closed that connection with the 202);
the session's real outcome is only ever observable via its own DB row.

Chosen over:
- **A single Scheduled Function doing the work directly** (the prior design) — violates the
  30-second limit for anything beyond a trivial stage.
- **New AWS event infrastructure** (EventBridge + SNS for Transcribe completion notifications) —
  a reasonable *future* upgrade (removes the up-to-2-minute dispatch latency), but out of this
  scope's authorization to create AWS resources, and not necessary for a v1 that only needs to
  comfortably fit inside a normal 10-30 minute assessment.
- **A bespoke queue service (SQS/Step Functions)** — more infrastructure than a dispatcher +
  bounded background worker needs at this scale.

## State machine

`intake_assessment_sessions.status` gains no new values in this scope (it already has
`processing`/`failed` from the prior phase). A `processing_stage` column tracks finer detail
underneath `status='processing'`: `transcription_staging → transcribing → transcript_persisted →
extracting`, cleared to `null` the moment a session leaves `processing` (success or failure). A
`processing_stage_entered_at` timestamp (added in this hardening pass) records when the current
stage was entered — see Idempotency below. `intake_sources` gains `transcription_provider` /
`transcription_job_id` / `transcription_provider_metadata` — a resumable handle to an in-flight
AWS Transcribe job.

## Idempotency

Every stage transition is guarded by a conditional database update
(`claimAssessmentProcessingStage` — `UPDATE ... WHERE processing_stage = <expected>`). Two
overlapping invocations racing on the same session can never both start a duplicate transcription
job or run extraction twice; the losing invocation's update simply affects zero rows and it does
nothing. The dispatcher is explicitly allowed to over-dispatch a session that's already being
worked on — this claim is what makes that safe rather than merely likely-fine.

**Hardening note, specific to the dispatcher/Background Function split**: once the "transcribing"
stage's real work (ffmpeg assembly, S3 staging, starting the Transcribe job) could take genuine
wall-clock time inside a Background Function, a second dispatch landing on the same session
*while the first invocation is still mid-flight* would see `processing_stage='transcribing'` with
no job id persisted yet — indistinguishable, by stage name alone, from a prior attempt that
crashed after claiming the stage but before persisting the job id. Restarting unconditionally
here would risk a second, duplicate Transcribe job. `claimStaleTranscribingStageForRestart()`
(`lib/data/assessmentIntelligence.ts`) closes this: it only allows a restart once
`processing_stage_entered_at` is older than `TRANSCRIBING_STAGE_STALE_AFTER_MS` (3 minutes,
`lib/assessmentIntelligence/pipeline.ts`) — comfortably longer than any real attempt should take,
short enough that a genuinely abandoned attempt still recovers within a couple of dispatcher
cycles. An invocation that finds the stage still fresh simply no-ops and leaves the in-flight
attempt alone.

## Preview / manual-test mechanism

Netlify Scheduled Functions do **not** run automatically on Deploy Previews, so the dispatcher
never fires there on its own. `lib/actions/assessmentProcessingAdmin.ts` exposes
`triggerAssessmentProcessingDispatch()` — a `role === "admin"`-only Server Action that calls
**the exact same `dispatchEligibleAssessmentProcessing()`** the scheduled dispatcher calls, so a
manual click exercises the real HTTP hand-off to the background stage worker (shared secret
included), not a simplified stand-in for it. Wired into Settings → "Assessment Processing
(Admin)" (`components/settings/AssessmentProcessingDispatchTrigger.tsx`), visible only to admins.

This does **not** touch the PHI gate. `PHI_AWS_PROCESSING_CONFIRMED` /
`PHI_OPENAI_PROCESSING_CONFIRMED` are still checked exactly where they always were, deep inside
`startTranscriptionStage()`, which runs after dispatch, inside the background worker. On a
Preview (gate unconfirmed, as everywhere until explicitly set) every dispatched session's stage
worker invocation reaches the gate check and no-ops there, precisely as it would on a real
scheduled tick — dispatching does not and cannot cause PHI processing that wasn't already
possible.

## AWS credential configuration (2026-08-16)

Netlify treats `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` as reserved platform variable names
and refuses to let a site set its own values for them. This pipeline uses Serve-specific names
instead — `SERVE_AWS_ACCESS_KEY_ID` / `SERVE_AWS_SECRET_ACCESS_KEY` — and every AWS client it
constructs (Transcribe, S3, Bedrock, the STS identity diagnostic) resolves credentials through
one shared function, `getServeAwsCredentials()` (`lib/assessmentIntelligence/awsCredentials.ts`),
never the AWS SDK's default credential provider chain. That chain would otherwise silently
resolve to whatever `AWS_*` variables are actually present in the Lambda execution environment
Netlify Functions run on — Netlify's own execution role, not this application's intended
identity — which explicit credentials make structurally impossible. `getServeAwsCredentials()`
fails closed: a half-configured pair (one variable set, the other missing) throws rather than
falling back to the default chain, and neither value is ever logged. The staging bucket variable
was renamed to match — `SERVE_AWS_TRANSCRIBE_STAGING_BUCKET` — one canonical name, no
`AWS_TRANSCRIBE_STAGING_BUCKET` fallback retained.

An admin-only AWS identity diagnostic (`checkAwsIdentity()`, Settings → "Assessment Processing
(Admin)" → "Check AWS Identity") calls `sts:GetCallerIdentity` — which requires no IAM policy
grant at all, by AWS design — and displays only the resolved account id and principal ARN, never
credential material. This is the way to confirm, before trusting any real Transcribe/Bedrock
call, that a deployment is actually authenticating as `serve-netlify-assessment-pipeline`.

## Acceptance test plan — real device synthetic recording

Not executed in this session (no real device or AWS access available here) — this is the plan
for the first real end-to-end validation, to run once the AWS resources below exist and before
declaring readiness for real PHI. Uses **synthetic content only** — a test operator reading a
fictional script, never a real resident. `PHI_AWS_PROCESSING_CONFIRMED` stays unset/false
throughout; the synthetic escape hatch (`PHI_SYNTHETIC_TEST_MODE`) is what allows this run to
reach AWS at all — see `phiGovernance.ts`.

1. **Capture** — on a real iPhone, open the native capture screen (`CaptureScreen.tsx`) against a
   test/synthetic resident record. Record for at least 60-90 seconds — long enough to produce
   **multiple real ~10s MediaRecorder chunks** (6-9+), not a single-chunk edge case — reading a
   fictional, clearly-synthetic script (no real names, no real health information). Pause/resume
   at least once to exercise that path. Finish the assessment; confirm the "Processing… you may
   leave this page" response is immediate (no visible wait).
2. **Chunk durability** — confirm in Supabase Storage (`intake-audio` bucket) that every expected
   chunk (`{session}/{000000..NNNNNN}.webm`) actually landed, in order, matching the recorded
   duration.
3. **Dispatch** — on a Deploy Preview, use the admin-only manual trigger
   (Settings → Assessment Processing (Admin)) rather than waiting for the schedule. Confirm in
   Netlify function logs that the dispatcher found the session and that the background stage
   worker was invoked (`x-assessment-worker-secret` present, 202-equivalent accepted).
4. **Assembly** — confirm in the background worker's logs that `audioAssembly.ts` ran without
   error: this is the first real exercise of the ffmpeg concat path against genuine
   MediaRecorder output (flagged elsewhere in this doc as unverified until this test runs).
5. **Verify assembled media** — before/independent of trusting Transcribe's result, pull the
   staged S3 input object (`transcribe-staging/<uuid>/assembled-input.webm`) and confirm it is a
   **valid, playable WebM file** whose duration matches the original recording (not truncated to
   one chunk's length, not corrupted) — e.g. `ffprobe` against the downloaded object. This is the
   step that actually proves assembly worked, independent of transcription quality.
6. **AWS Transcribe** — confirm the job reaches `COMPLETED` (not `FAILED`), the transcript text is
   persisted to `intake_sources.transcript_text` / `intake_transcript_segments`, and both the
   input and output S3 objects are deleted immediately after (per the cleanup contract in
   `awsTranscribeProvider.ts`).
7. **Extraction + UI** — confirm extraction runs and the session reaches `draft`/`needs_review`;
   confirm the review page's "Processing" banner correctly transitioned away without a manual
   page reload (the 20-second `router.refresh()` interval); confirm the transcript shown in
   "View Source Conversation" reads as one continuous conversation, not truncated or reordered.
8. **Failure path** — separately, force one failure (e.g. temporarily point
   `SERVE_AWS_TRANSCRIBE_STAGING_BUCKET` at a nonexistent bucket) and confirm the session reaches
   `status='failed'` with a stage/reason, surfaces on the resident page and in Today's Work, and
   that Retry recovers correctly afterward.

## Out of scope for this pass, called out explicitly

- `app/api/intake/transcribe/route.ts` (the external serve-intake-mvp webhook receiver) still
  awaits transcription synchronously within one HTTP request — it was not part of this task's
  mandate (native capture only) and was kept minimally functional against the new single-job
  provider shape rather than redesigned. Its worst-case wait dropped from ~180 jobs to 1, which
  is a meaningful improvement even though full elimination is unaddressed here.
- EventBridge-based Transcribe completion events (see above).
- Real-time streaming assistance (explicitly deferred — see the completion report for this
  scope).
