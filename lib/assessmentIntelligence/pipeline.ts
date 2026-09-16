import "server-only";
import {
  getAssessmentSession,
  getCombinedTranscriptText,
  writeDraftFacts,
  detectAndRecordConflicts,
  getOpenConflictsForSession,
  updateAssessmentSessionStatus,
  getAudioSourceForSession,
  downloadAudioChunksForSession,
  writeTranscriptSegments,
  updateSourceTranscriptText,
  recordTranscriptionOutcome,
  claimSessionForProcessing,
  markSessionFailed,
  recoverStaleProcessingSessions,
  getQueuedSessionsForDispatch,
  getMostRecentSourceIdForSession,
  recordProcessingDiagnosticStage,
} from "../data/assessmentIntelligence.ts";
import { transcribeAudioChunks } from "./transcription.ts";
import { isPhiOpenAiProcessingConfirmed, type PhiGateOverride } from "./phiGovernance.ts";
import { getConfiguredExtractionProvider } from "./providerSelection.ts";
import { MAX_PROCESSING_ATTEMPTS, STALE_PROCESSING_AFTER_MS, sanitizeFailureReason } from "./processingQueue.ts";
import { GENERATED_DEPLOY_CONTEXT, type GeneratedDeployContext } from "./generatedDeployContext.ts";

// The shared tail of both entry points into extraction (pasted-transcript admin/test fallback,
// and the real captured-audio pipeline below) — one pipeline, two ways in, per the
// source-agnostic boundary this was designed around from the start (docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §3A). Provider-neutral: this function calls
// through providerSelection.ts, never a specific provider module directly — see docs/
// architecture/BEDROCK_CLAUDE_PROVIDER.md.

export interface ExtractionPipelineResult {
  error?: string;
  draftFactCount?: number;
  rejectedCount?: number;
}

export async function runExtractionPipelineForSession(
  assessmentSessionId: string,
  residentId: string,
  sourceId: string
): Promise<ExtractionPipelineResult> {
  const combinedText = await getCombinedTranscriptText(assessmentSessionId);
  const provider = getConfiguredExtractionProvider();
  // A thrown error here (provider-level failure) is deliberately allowed to propagate — never
  // caught-and-rerouted to a different provider. See AssessmentExtractionProvider's contract.
  const extraction = await provider.extractFacts(combinedText);

  if (extraction.rawResponseParseError) {
    return { error: `Extraction failed to parse a valid response: ${extraction.rawResponseParseError}` };
  }

  const runRef = `extraction-${Date.now()}`;
  await writeDraftFacts({
    assessmentSessionId,
    sourceId,
    facts: extraction.accepted,
    extractionRunRef: runRef,
    modelVersion: `${extraction.provider}:${extraction.modelId}`,
  });

  await detectAndRecordConflicts(residentId, assessmentSessionId);

  const openConflicts = await getOpenConflictsForSession(assessmentSessionId);
  await updateAssessmentSessionStatus(assessmentSessionId, openConflicts.length > 0 ? "needs_review" : "draft");

  return { draftFactCount: extraction.accepted.length, rejectedCount: extraction.rejected.length };
}

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

// ─── Asynchronous extraction queue (2026-09-16) ──────────────────────────────────────────────
// Fixes a real, observed failure: a pasted-transcript submission ran runExtractionPipelineForSession()
// above synchronously inside the browser's own request, so a slow provider call (or a platform
// function timeout) could strand the browser and leave the session at status='processing'
// forever, with no failure state and no retry. The fix moves that same call — unchanged — off
// the request path entirely: submitPastedTranscriptAndExtract() (lib/actions/
// assessmentIntelligence.ts) now only persists the transcript and marks the session 'queued',
// then returns immediately. A scheduled dispatcher finds queued work and hands it to a
// Background Function, which claims the session and runs this exact same extraction pipeline.
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

export interface AdvanceProcessingResult {
  assessmentSessionId: string;
  outcome: "processed" | "not_eligible" | "failed";
  error?: string;
}

/** The background worker's entire job: claim one queued session, run the existing extraction
 * pipeline unchanged, and durably record the outcome either way. Never called directly by a
 * browser — only by the background-function handler (netlify/functions/
 * assessment-processing-stage-worker-background.mts) after verifying the shared secret. */
export async function advanceQueuedAssessmentProcessing(assessmentSessionId: string): Promise<AdvanceProcessingResult> {
  // Diagnostic-only breadcrumb, written before authentication/claim are known to have succeeded
  // -- proves the background handler itself actually started running at all (see
  // recordProcessingDiagnosticStage()'s comment; never blocks or fails this real path).
  await recordProcessingDiagnosticStage(assessmentSessionId, "worker_received");

  const claimed = await claimSessionForProcessing(assessmentSessionId);
  if (!claimed) {
    // Not an error: either another invocation already claimed it (safe, expected — see the
    // conditional-update pattern in claimSessionForProcessing()), or it was never queued.
    return { assessmentSessionId, outcome: "not_eligible" };
  }

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) {
    // Should not happen (we just claimed it) — fail closed rather than leaving it stuck at
    // 'processing' with no explanation.
    await markSessionFailed(assessmentSessionId, "Session not found immediately after being claimed for processing.");
    return { assessmentSessionId, outcome: "failed", error: "Session not found after claim." };
  }

  await recordProcessingDiagnosticStage(assessmentSessionId, "extraction_started");

  try {
    const sourceId = await getMostRecentSourceIdForSession(assessmentSessionId);
    await runExtractionPipelineForSession(assessmentSessionId, session.resident_id, sourceId ?? "");
    return { assessmentSessionId, outcome: "processed" };
  } catch (err) {
    const reason = sanitizeFailureReason(err);
    await markSessionFailed(assessmentSessionId, reason);
    return { assessmentSessionId, outcome: "failed", error: reason };
  }
}

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
    // within the scheduled dispatcher's own short execution budget.
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
