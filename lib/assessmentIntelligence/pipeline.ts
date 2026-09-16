import "server-only";
import {
  getAssessmentSession,
  getAudioSourceForSession,
  downloadAudioChunksForSession,
  writeTranscriptSegments,
  updateSourceTranscriptText,
  recordTranscriptionOutcome,
  recoverStaleProcessingSessions,
  getQueuedSessionsForDispatch,
  recordProcessingDiagnosticStage,
} from "../data/assessmentIntelligence.ts";
import { transcribeAudioChunks } from "./transcription.ts";
import { isPhiOpenAiProcessingConfirmed, type PhiGateOverride } from "./phiGovernance.ts";
import { MAX_PROCESSING_ATTEMPTS, STALE_PROCESSING_AFTER_MS } from "./processingQueue.ts";
import { GENERATED_DEPLOY_CONTEXT, type GeneratedDeployContext } from "./generatedDeployContext.ts";
import {
  runExtractionPipelineForSession,
  advanceQueuedAssessmentProcessing,
  type ExtractionPipelineResult,
  type AdvanceProcessingResult,
} from "./backgroundCore/processingCore.ts";

// SPLIT (2026-09-17): runExtractionPipelineForSession() and advanceQueuedAssessmentProcessing()
// -- the two functions the background worker needs -- now live in
// ./backgroundCore/processingCore.ts, a module with no `import "server-only"` and no React/Next
// dependency, so it's safely importable from netlify/functions/assessment-processing-stage-
// worker-background.mts directly, in-process, replacing the same-site HTTP callback
// architecture (Background Function -> fetch() -> app/api/assessment-processing/worker Route
// Handler) abandoned after three separate live tests each stalled at that exact same-site
// fetch. Imported and re-exported here so every existing caller of these two names (this file's
// own transcribeAndExtractAssessmentAudio() below, and app/api/assessment-processing/worker/
// route.ts historically) is unaffected -- this is the one implementation, never duplicated. See
// backgroundCore/dataAccess.ts's header comment for the full rationale.

export { runExtractionPipelineForSession, advanceQueuedAssessmentProcessing, type ExtractionPipelineResult, type AdvanceProcessingResult };

export interface TranscribeAndExtractResult {
  error?: string;
  phiGateBlocked?: boolean;
  alreadyProcessed?: boolean;
  chunksTranscribed?: number;
  chunksFailed?: number;
  partial?: boolean;
  draftFactCount?: number;
  rejectedCount?: number;
}

/** Service-to-service entry point for the captured-audio pipeline — called only from
 * app/api/intake/transcribe/route.ts after that route has verified the shared webhook secret.
 * Deliberately NOT exported from a "use server" actions file: this function has no human-session
 * check (there is no Serve OS user in a webhook call from serve-intake-mvp), so it must never be
 * reachable as a directly callable Next.js Server Action.
 *
 * `gateOverride` defaults to undefined, which means the strict production PHI gate applies —
 * the production webhook route never passes anything else. Only a dedicated, manually-run
 * synthetic-data validation script passes `{ syntheticTestOverride: true }`, and even then
 * phiGovernance.ts requires a second, separate flag to actually be set before it does anything. */
export async function transcribeAndExtractAssessmentAudio(
  assessmentSessionId: string,
  gateOverride?: PhiGateOverride
): Promise<TranscribeAndExtractResult> {
  if (!isPhiOpenAiProcessingConfirmed(gateOverride)) {
    return {
      error:
        "PHI processing is not confirmed for this call — real captured audio may not be transcribed until a human has confirmed the BAA is executed and Modified Retention is provisioned.",
      phiGateBlocked: true,
    };
  }

  const source = await getAudioSourceForSession(assessmentSessionId);
  if (!source) return { error: "No audio source found for this assessment session." };
  if (source.status !== "uploaded") {
    return { error: `Audio source status is '${source.status}', not yet 'uploaded' — nothing to transcribe.` };
  }

  // Idempotency guard: a retried/duplicate webhook call for a session that was already
  // transcribed must not re-transcribe, re-insert a second set of segments, or re-run
  // extraction a second time (which would duplicate draft facts). transcript_text is only ever
  // set once, by this same function, so its presence is a reliable "already done" signal.
  if (source.transcript_text !== null) {
    return { alreadyProcessed: true };
  }

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const chunks = await downloadAudioChunksForSession(assessmentSessionId);
  if (chunks.length === 0) return { error: "No audio chunks found in storage for this session." };

  const transcription = await transcribeAudioChunks(
    chunks.map((c) => ({ path: c.path, bytes: c.bytes, mimeType: c.mimeType })),
    gateOverride
  );

  if (transcription.segments.length === 0) {
    await recordTranscriptionOutcome({
      sourceId: source.id,
      totalChunks: chunks.length,
      succeededChunks: 0,
      failedChunkPaths: transcription.failedChunks.map((f) => f.path),
    });
    return {
      error: "Transcription produced no usable text from any chunk.",
      chunksTranscribed: 0,
      chunksFailed: transcription.failedChunks.length,
      partial: false,
    };
  }

  await writeTranscriptSegments({
    sourceId: source.id,
    segments: transcription.segments.map((s) => ({ text: s.text, chunkIndex: s.chunkIndex })),
  });

  const combinedText = transcription.segments
    .slice()
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((s) => s.text)
    .join(" ");
  await updateSourceTranscriptText(source.id, combinedText);

  // Recorded durably regardless of outcome — a partial transcript (some chunks failed) must
  // stay visible to anyone reviewing this session later, not just present in this function's
  // return value for whichever caller happened to be watching when it ran.
  const isPartial = transcription.failedChunks.length > 0;
  await recordTranscriptionOutcome({
    sourceId: source.id,
    totalChunks: chunks.length,
    succeededChunks: transcription.segments.length,
    failedChunkPaths: transcription.failedChunks.map((f) => f.path),
  });

  const pipelineResult = await runExtractionPipelineForSession(assessmentSessionId, session.resident_id, source.id);

  return {
    ...pipelineResult,
    chunksTranscribed: transcription.segments.length,
    chunksFailed: transcription.failedChunks.length,
    partial: isPartial,
  };
}

// ─── Asynchronous extraction queue (2026-09-16, background-safe core split 2026-09-17) ────────
// Fixes a real, observed failure: a pasted-transcript submission ran runExtractionPipelineForSession()
// above synchronously inside the browser's own request, so a slow provider call (or a platform
// function timeout) could strand the browser and leave the session at status='processing'
// forever, with no failure state and no retry. The fix moves that same call — unchanged — off
// the request path entirely: submitPastedTranscriptAndExtract() (lib/actions/
// assessmentIntelligence.ts) now only persists the transcript and marks the session 'queued',
// then returns immediately. A scheduled dispatcher (this file, below) finds queued work and
// fires an async invocation of the background worker
// (netlify/functions/assessment-processing-stage-worker-background.mts), which now calls
// advanceQueuedAssessmentProcessing() (backgroundCore/processingCore.ts) directly, in-process --
// no HTTP hop back into this site's own Next.js routes (see that .mts file's header comment for
// why that approach was abandoned).
//
// Deliberately keyed on session status alone ("queued" -> claim -> extract), not on how the
// session got there — a future audio pipeline slice can set status='queued' once a transcript is
// ready instead of calling runExtractionPipelineForSession() directly (as
// transcribeAndExtractAssessmentAudio() above still does, untouched, out of scope for this
// slice) and it enters this exact same queue without any redesign here.
//
// Pattern modeled on (not copied from) feature/assessment-aws-transcription-pipeline's
// dispatcher/background-worker split and its resolveSiteBaseUrl() fix for the "Deploy Preview's
// dispatcher silently resolved to the production URL" bug — reused because both are general
// Netlify-Functions lessons, not anything AWS/audio-specific. This slice needs none of that
// branch's multi-stage processing_stage model or job-id tracking: extraction is one bounded
// step, not a resumable multi-tick external job.

export interface DispatchOutcome {
  assessmentSessionId: string;
  /** True only means "the background worker accepted the invocation" (an immediate 202-style
   * acknowledgment) — never "extraction finished," since a Background Function's actual result
   * is never delivered back to its invoker. The session's real outcome is only ever observable
   * via its own durable state on a later read. */
  dispatched: boolean;
  error?: string;
}

export const STAGE_WORKER_BACKGROUND_PATH = "/.netlify/functions/assessment-processing-stage-worker-background";
export const DEFAULT_DISPATCH_LIMIT = 20;

export interface SiteBaseUrlResolution {
  baseUrl: string | null;
  source: "DEPLOY_PRIME_URL" | "none";
  deploymentContext: string | null;
}

// See generatedDeployContext.ts's header comment: DEPLOY_PRIME_URL is build-time-only and never
// forwarded into a Function's runtime process.env, and process.env.URL is always the site's
// PRODUCTION address regardless of deploy context — using it here would let a branch-deploy or
// Deploy Preview's dispatcher silently invoke production's background worker. Resolving
// exclusively from the generated module and failing closed (source: "none") when it's unset
// (local dev, or a build that skipped the generator) is deliberate, not an oversight.
export function resolveSiteBaseUrl(deployContext: GeneratedDeployContext = GENERATED_DEPLOY_CONTEXT): SiteBaseUrlResolution {
  return {
    baseUrl: deployContext.deployPrimeUrl,
    source: deployContext.deployPrimeUrl ? "DEPLOY_PRIME_URL" : "none",
    deploymentContext: deployContext.context,
  };
}

async function invokeStageWorker(assessmentSessionId: string): Promise<DispatchOutcome> {
  const { baseUrl } = resolveSiteBaseUrl();
  const secret = process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  if (!baseUrl) {
    return {
      assessmentSessionId,
      dispatched: false,
      error: "No site URL available (DEPLOY_PRIME_URL was not captured for this build) — cannot invoke the background worker.",
    };
  }
  if (!secret) {
    return {
      assessmentSessionId,
      dispatched: false,
      error: "Missing ASSESSMENT_PROCESSING_WORKER_SECRET — refusing to invoke the background worker unauthenticated.",
    };
  }

  // Diagnostic-only breadcrumb: the dispatcher has selected this session and is about to invoke
  // the worker. Written even though the fetch below might still fail -- that's the point: if the
  // next Maggie test shows a session stuck at exactly this stage, the failure is in the fetch
  // itself (network/DNS/URL), not anywhere past it.
  await recordProcessingDiagnosticStage(assessmentSessionId, "dispatched");

  try {
    // Netlify Background Functions acknowledge (202) almost immediately, before the handler
    // itself finishes running — this fetch resolves as soon as the invocation is accepted, not
    // after extraction (which may run for minutes) completes. Awaiting it here is therefore safe
    // within the scheduled dispatcher's own short execution budget. This is the one HTTP hop
    // that stays: Next runtime -> Netlify Function endpoint, a different (and always reliable,
    // per every live test so far) direction from the same-site callback that was removed from
    // the OTHER side of this handoff -- see the .mts file's own header comment. No siteBaseUrl
    // in the body anymore: the worker no longer calls back into this site at all, so it has
    // nothing left to resolve a base URL for.
    const response = await fetch(`${baseUrl}${STAGE_WORKER_BACKGROUND_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-assessment-worker-secret": secret },
      body: JSON.stringify({ assessmentSessionId }),
    });
    if (!response.ok) {
      return { assessmentSessionId, dispatched: false, error: `Background worker invocation responded ${response.status}.` };
    }
    // Netlify returned a 2xx for the initial HTTP request only -- see DispatchOutcome's comment.
    // This does NOT mean the worker itself has started; "worker_received" (written from inside
    // advanceQueuedAssessmentProcessing) is the next, and first worker-side, evidence.
    await recordProcessingDiagnosticStage(assessmentSessionId, "invocation_accepted");
    return { assessmentSessionId, dispatched: true };
  } catch (err) {
    return { assessmentSessionId, dispatched: false, error: err instanceof Error ? err.message : "Unknown error invoking background worker." };
  }
}

/** The scheduled dispatcher's entire job: recover any stuck sessions (bounded — see
 * decideStaleRecovery()), then find up to `limit` newly-queued sessions and fire an async
 * invocation of the background worker for each. Never awaits the provider call itself. */
export async function dispatchEligibleAssessmentProcessing(limit = DEFAULT_DISPATCH_LIMIT): Promise<DispatchOutcome[]> {
  await recoverStaleProcessingSessions(STALE_PROCESSING_AFTER_MS, MAX_PROCESSING_ATTEMPTS);
  const sessions = await getQueuedSessionsForDispatch(limit);
  return Promise.all(sessions.map((session) => invokeStageWorker(session.id)));
}
