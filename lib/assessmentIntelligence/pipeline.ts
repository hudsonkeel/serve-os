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
  markAssessmentSessionFailed,
  claimAssessmentProcessingStage,
  claimStaleTranscribingStageForRestart,
  persistTranscriptionJobHandle,
  getSessionsEligibleForProcessing,
  type AudioSourceRow,
  type AssessmentSessionRecord,
} from "../data/assessmentIntelligence.ts";
import { isPhiOpenAiProcessingConfirmed, isPhiAwsProcessingConfirmed, type PhiGateOverride } from "./phiGovernance.ts";
import { getConfiguredExtractionProvider } from "./providerSelection.ts";
import {
  getConfiguredTranscriptionProvider,
  getConfiguredTranscriptionProviderKey,
  getTranscriptionProviderByProviderId,
} from "./transcriptionProviderSelection.ts";
import type { TranscriptionJobHandle, TranscriptionProviderResult } from "./transcriptionProvider.ts";

// Which PHI gate applies depends on which transcription provider is actually configured —
// resolved once here rather than duplicated at every call site. "aws" is the only non-default
// key transcriptionProviderSelection.ts recognizes today; anything else (including the
// default, "openai") uses the OpenAI gate.
//
// Used ONLY by transcribeAndExtractAssessmentAudio (the external serve-intake-mvp webhook path)
// — that function's gateOverride mechanism is unchanged, out of this scope. The native
// dispatcher/background-worker path below uses a DIFFERENT, session-aware check
// (isSessionAuthorizedForConfiguredTranscriptionProvider) — see its own comment for why.
function isConfiguredTranscriptionProviderPhiConfirmed(gateOverride?: PhiGateOverride): boolean {
  const key = getConfiguredTranscriptionProviderKey();
  return key === "aws" ? isPhiAwsProcessingConfirmed(gateOverride) : isPhiOpenAiProcessingConfirmed(gateOverride);
}

// ─── Session-scoped AWS-processing authorization (2026-08-16, AWS Synthetic Assessment
// Deployment Preflight) ─────────────────────────────────────────────────────────────────────
// The real dispatcher/background-worker path (startTranscriptionStage/continueTranscribing,
// below) must never use a broad, environment-wide flag as authorization for an ARBITRARY
// session — PHI_SYNTHETIC_TEST_MODE alone is exactly that kind of flag, and was never meant to
// authorize the production-shaped worker's real AWS calls for whichever session happens to be
// eligible on a given tick. This function replaces that risk with a rule that can never authorize
// more than the one session it's asked about:
//
//   proceed with AWS processing for THIS session only if:
//     PHI_AWS_PROCESSING_CONFIRMED === "true"                              (the real production
//                                                                            gate — unaffected,
//                                                                            never touched here)
//     OR
//     this session's own is_synthetic_test === true                        (durable, admin-set,
//                                                                            per-row)
//     AND PHI_SYNTHETIC_TEST_MODE is also active                           (this DEPLOYMENT has
//                                                                            synthetic testing
//                                                                            enabled at all)
//
// Both the row flag AND the environment flag are required for the synthetic path — neither
// alone is sufficient. The environment flag can never authorize a session whose own
// is_synthetic_test is false (every other session is evaluated independently, against its own
// row), and the row flag can never authorize AWS processing in a deployment that hasn't
// separately opted into synthetic-test mode. is_synthetic_test is only ever set by the
// admin-only createSyntheticAssessmentSession action (lib/actions/assessmentProcessingAdmin.ts)
// — never inferred, never inferable from a resident's name or any other field — so by the time
// this function reads it, "an admin explicitly authorized this session for synthetic AWS
// testing" is already a durable fact, not something that needs re-checking against a live
// actor/request (a background worker invocation has no such context anyway).
//
// Scoped to the "aws" provider specifically, matching this task's mandate — the OpenAI gate's
// resolution is untouched.
//
// Exported (unlike this module's other internal helpers) specifically so it can be unit-tested
// directly — it is pure decision logic with no I/O, the exact kind of thing this codebase's
// existing test convention (narrow, DB/AWS-free guard tests) is built for. See
// assessmentProcessingAuthorization.test.ts.
export function isSessionAuthorizedForConfiguredTranscriptionProvider(session: AssessmentSessionRecord): boolean {
  const key = getConfiguredTranscriptionProviderKey();
  if (key !== "aws") {
    return isPhiOpenAiProcessingConfirmed();
  }
  if (isPhiAwsProcessingConfirmed()) return true;
  return session.is_synthetic_test === true && isPhiAwsProcessingConfirmed({ syntheticTestOverride: true });
}

/** The gateOverride to pass down into the AWS provider's own defensive, belt-and-suspenders gate
 * check (requirePhiAwsProcessingConfirmed, called again inside awsTranscribeProvider.ts) once
 * isSessionAuthorizedForConfiguredTranscriptionProvider has already confirmed this session may
 * proceed. Mirrors that same session-then-environment reasoning at the provider boundary: only a
 * session explicitly marked synthetic ever gets the override passed through; every other session
 * gets undefined, which means the provider's own check falls through to the real
 * PHI_AWS_PROCESSING_CONFIRMED gate exactly as before. */
function gateOverrideForSession(session: AssessmentSessionRecord): PhiGateOverride | undefined {
  return session.is_synthetic_test === true ? { syntheticTestOverride: true } : undefined;
}

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

  let extraction;
  try {
    // A thrown error here (provider-level failure) is deliberately never caught-and-rerouted
    // to a different provider — see AssessmentExtractionProvider's contract. It IS caught here
    // once, only to durably record failure state (Phase 13) before re-throwing, so a caller
    // that doesn't itself handle failure state (e.g. a future direct caller) still sees the
    // real error.
    extraction = await provider.extractFacts(combinedText);
  } catch (err) {
    await markAssessmentSessionFailed({
      assessmentSessionId,
      stage: "extraction",
      reason: err instanceof Error ? err.message : "Unknown extraction provider error",
    });
    throw err;
  }

  if (extraction.rawResponseParseError) {
    await markAssessmentSessionFailed({
      assessmentSessionId,
      stage: "extraction",
      reason: `Extraction failed to parse a valid response: ${extraction.rawResponseParseError}`,
    });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SYNC_POLL_INTERVAL_MS = 2000;
const SYNC_POLL_MAX_ATTEMPTS = 40; // ~80s ceiling — generous for one assembled-assessment job

/** Drives a provider's two-phase (start/check) interface to completion within a single call —
 * used only by transcribeAndExtractAssessmentAudio below (the external serve-intake-mvp webhook
 * receiver, which awaits synchronously within one HTTP request and is explicitly out of THIS
 * scope's mandate to redesign — see this scope's completion report). The native capture path
 * (advanceAssessmentProcessing, further down) deliberately does NOT use this helper: it performs
 * at most one non-blocking check per call, exactly so a background worker tick never blocks on
 * AWS. This helper exists only to keep the pre-existing webhook route functionally correct
 * against the new single-job-per-assessment provider shape (previously up to ~180 per-chunk
 * jobs' worth of in-request waiting; now at most one job's worth). */
async function runTranscriptionToCompletion(
  chunks: { path: string; bytes: ArrayBuffer; mimeType: string }[],
  gateOverride?: PhiGateOverride
): Promise<TranscriptionProviderResult> {
  const provider = getConfiguredTranscriptionProvider();
  const start = await provider.startTranscription(chunks, gateOverride);
  if (start.status === "completed") {
    return start.result as TranscriptionProviderResult;
  }

  const handle = start.handle;
  for (let attempt = 0; attempt < SYNC_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(SYNC_POLL_INTERVAL_MS);
    const check = await provider.checkTranscription(handle, gateOverride);
    if (check.status === "completed") return check.result as TranscriptionProviderResult;
    if (check.status === "failed") throw new Error(check.error ?? "Transcription job failed.");
    // still pending — loop again with the same handle
  }

  throw new Error("Transcription job did not complete in time.");
}

/** Service-to-service entry point for the EXTERNAL serve-intake-mvp captured-audio pipeline —
 * called only from app/api/intake/transcribe/route.ts after that route has verified the shared
 * webhook secret. Deliberately NOT exported from a "use server" actions file: this function has
 * no human-session check (there is no Serve OS user in a webhook call from serve-intake-mvp), so
 * it must never be reachable as a directly callable Next.js Server Action.
 *
 * NOT the native Serve OS capture path — that path uses advanceAssessmentProcessing() below,
 * which never awaits AWS work inside a user-facing request. This function still does (see
 * runTranscriptionToCompletion above) because the external webhook contract this responds to
 * predates and is out of scope for this redesign; only the underlying provider shape changed
 * out from under it (one job per assessment, not one per chunk — still a meaningful
 * improvement to its worst-case wait time even though it remains synchronous).
 *
 * `gateOverride` defaults to undefined, which means the strict production PHI gate applies —
 * the production webhook route never passes anything else. Only a dedicated, manually-run
 * synthetic-data validation script passes `{ syntheticTestOverride: true }`, and even then
 * phiGovernance.ts requires a second, separate flag to actually be set before it does anything. */
export async function transcribeAndExtractAssessmentAudio(
  assessmentSessionId: string,
  gateOverride?: PhiGateOverride
): Promise<TranscribeAndExtractResult> {
  if (!isConfiguredTranscriptionProviderPhiConfirmed(gateOverride)) {
    return {
      error:
        "PHI processing is not confirmed for the configured transcription provider — real captured audio may not be transcribed until a human has explicitly confirmed the relevant provider's PHI governance gate (PHI_OPENAI_PROCESSING_CONFIRMED or PHI_AWS_PROCESSING_CONFIRMED, depending on ASSESSMENT_TRANSCRIPTION_PROVIDER).",
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

  let transcription: TranscriptionProviderResult;
  try {
    // A thrown error here (provider-level failure — e.g. AWS auth/config failure, not an
    // individual chunk's transcription failing) is deliberately never caught-and-rerouted to a
    // different provider. Real PHI must never be silently sent to OpenAI as a fallback because
    // AWS failed, or vice versa. Caught here once, only to durably record failure state.
    transcription = await runTranscriptionToCompletion(chunks, gateOverride);
  } catch (err) {
    await markAssessmentSessionFailed({
      assessmentSessionId,
      stage: "transcription",
      reason: err instanceof Error ? err.message : "Unknown transcription provider error",
    });
    throw err;
  }

  if (transcription.segments.length === 0) {
    await recordTranscriptionOutcome({
      sourceId: source.id,
      totalChunks: chunks.length,
      succeededChunks: 0,
      failedChunkPaths: transcription.failedChunks.map((f) => f.path),
    });
    await markAssessmentSessionFailed({
      assessmentSessionId,
      stage: "transcription",
      reason: "Transcription produced no usable text from any chunk.",
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

/** Explicit, user-triggered retry (Phase 13) for a session left in `status = 'failed'` — the
 * fix for the previously-identified "stuck at processing forever, no explanation" gap. Distinct
 * from transcribeAndExtractAssessmentAudio's own idempotency guard (which exists to make a
 * *duplicate webhook call* a safe no-op): this function is only ever called by an explicit human
 * action from the review UI, only for a session already marked 'failed'.
 *
 * Resumes from exactly the right checkpoint: if a transcript already exists, only extraction is
 * retried (never re-transcribed); otherwise the session is put back into the SAME background
 * processing state the native worker advances on its own — 'processing' /
 * 'transcription_staging' — so the next worker tick picks it up exactly like any other pending
 * session, rather than this action re-implementing transcription itself. */
export async function retryFailedAssessmentProcessing(assessmentSessionId: string): Promise<TranscribeAndExtractResult> {
  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const source = await getAudioSourceForSession(assessmentSessionId);
  if (!source) return { error: "No audio source found for this assessment session." };

  if (source.transcript_text !== null) {
    // Transcription already succeeded on a prior attempt — only extraction failed. Retry
    // extraction alone, directly, never re-downloading/re-transcribing audio.
    const pipelineResult = await runExtractionPipelineForSession(assessmentSessionId, session.resident_id, source.id);
    return pipelineResult;
  }

  // No transcript exists yet — either transcription itself failed, or this session never got
  // past 'uploaded'. Hand it back to the background worker rather than re-implementing
  // transcription here: mark it 'processing' at the 'transcription_staging' stage (the same
  // state Finish itself puts a fresh session into) and let the next worker tick pick it up,
  // exactly as if it had never failed. The worker always uses production gate resolution; a
  // synthetic retry of a genuinely-failed session is not a supported combination.
  await updateAssessmentSessionStatus(assessmentSessionId, "processing");
  const claimed = await claimAssessmentProcessingStage({
    assessmentSessionId,
    expectedStage: null,
    nextStage: "transcription_staging",
  });
  if (!claimed) {
    return { error: "Could not re-queue this session for processing — it may already be in progress." };
  }
  return { alreadyProcessed: false };
}

// ─── Native Serve OS capture — background worker orchestration ─────────────────────────────
// Production Assessment Transcription Orchestration (2026-08-15). Unlike
// transcribeAndExtractAssessmentAudio above, advanceAssessmentProcessing() NEVER awaits AWS
// job completion inside itself — it advances a session by exactly one durable step (or falls
// straight through into extraction once a transcript is freshly available, since extraction is
// a single fast provider call, not a long-running external job) and returns. It is meant to be
// called repeatedly, on a schedule, by a short-lived background worker
// (netlify/functions/assessment-processing-worker.ts) — see this scope's completion report §4/§5.
//
// Idempotency (Phase 6): every stage transition is guarded by
// claimAssessmentProcessingStage()'s conditional update, so two overlapping worker ticks (or a
// duplicate scheduled invocation) can never both start a second Transcribe job, write a second
// set of transcript segments, or run extraction twice for the same session. A tick that loses
// the race for a session simply does nothing and returns "no_op" — never an error.

export type AdvanceProcessingOutcome = "advanced" | "no_op" | "completed" | "failed" | "not_processing" | "error";

export interface AdvanceProcessingResult {
  assessmentSessionId: string;
  outcome: AdvanceProcessingOutcome;
  stage?: string;
  error?: string;
}

async function persistTranscriptAndOutcome(
  source: AudioSourceRow,
  chunkCount: number,
  transcription: TranscriptionProviderResult
): Promise<{ ok: boolean; error?: string }> {
  if (transcription.segments.length === 0) {
    await recordTranscriptionOutcome({
      sourceId: source.id,
      totalChunks: chunkCount,
      succeededChunks: 0,
      failedChunkPaths: transcription.failedChunks.map((f) => f.path),
    });
    return { ok: false, error: "Transcription produced no usable text." };
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

  await recordTranscriptionOutcome({
    sourceId: source.id,
    totalChunks: chunkCount,
    succeededChunks: transcription.segments.length,
    failedChunkPaths: transcription.failedChunks.map((f) => f.path),
  });

  return { ok: true };
}

async function runExtractionStage(session: AssessmentSessionRecord, source: AudioSourceRow): Promise<AdvanceProcessingResult> {
  const claimed = await claimAssessmentProcessingStage({
    assessmentSessionId: session.id,
    expectedStage: "transcript_persisted",
    nextStage: "extracting",
  });
  if (!claimed) {
    return { assessmentSessionId: session.id, outcome: "no_op", stage: "transcript_persisted" };
  }

  const result = await runExtractionPipelineForSession(session.id, session.resident_id, source.id);
  if (result.error) {
    return { assessmentSessionId: session.id, outcome: "failed", stage: "extracting", error: result.error };
  }
  return { assessmentSessionId: session.id, outcome: "completed", stage: "extracting" };
}

async function startTranscriptionStage(
  session: AssessmentSessionRecord,
  source: AudioSourceRow
): Promise<AdvanceProcessingResult> {
  // A PHI-gate block is a deliberate, expected, non-error state (neither the production gate
  // nor this specific session's synthetic authorization is in place yet) — never treated as a
  // failure. The session is left exactly as-is; every future worker tick will keep seeing the
  // same gate-blocked state harmlessly until an operator changes configuration or an admin
  // explicitly marks this session synthetic.
  if (!isSessionAuthorizedForConfiguredTranscriptionProvider(session)) {
    return { assessmentSessionId: session.id, outcome: "no_op", stage: "transcription_staging" };
  }
  const gateOverride = gateOverrideForSession(session);

  const claimed = await claimAssessmentProcessingStage({
    assessmentSessionId: session.id,
    expectedStage: session.processing_stage ?? null,
    nextStage: "transcribing",
  });
  if (!claimed) {
    return { assessmentSessionId: session.id, outcome: "no_op", stage: session.processing_stage ?? undefined };
  }

  const chunks = await downloadAudioChunksForSession(session.id);
  if (chunks.length === 0) {
    await markAssessmentSessionFailed({
      assessmentSessionId: session.id,
      stage: "transcription",
      reason: "No audio chunks found in storage for this session.",
    });
    return { assessmentSessionId: session.id, outcome: "failed", stage: "transcribing", error: "No audio chunks found." };
  }

  const provider = getConfiguredTranscriptionProvider();
  let start;
  try {
    start = await provider.startTranscription(
      chunks.map((c) => ({ path: c.path, bytes: c.bytes, mimeType: c.mimeType })),
      gateOverride
    );
  } catch (err) {
    await markAssessmentSessionFailed({
      assessmentSessionId: session.id,
      stage: "transcription",
      reason: err instanceof Error ? err.message : "Unknown transcription provider error",
    });
    return { assessmentSessionId: session.id, outcome: "failed", stage: "transcribing", error: "Provider failed to start transcription." };
  }

  if (start.status === "pending") {
    await persistTranscriptionJobHandle({
      sourceId: source.id,
      providerId: start.handle.providerId,
      jobId: start.handle.jobId,
      metadata: start.handle.metadata,
    });
    return { assessmentSessionId: session.id, outcome: "advanced", stage: "transcribing" };
  }

  // Synchronous provider (or zero-chunk shortcut) — the transcript is already available in this
  // same tick. Persist it and fall straight through into extraction rather than waiting for a
  // future tick to notice a transcript that already exists.
  const persisted = await persistTranscriptAndOutcome(source, chunks.length, start.result as TranscriptionProviderResult);
  if (!persisted.ok) {
    await markAssessmentSessionFailed({ assessmentSessionId: session.id, stage: "transcription", reason: persisted.error ?? "Transcription failed." });
    return { assessmentSessionId: session.id, outcome: "failed", stage: "transcribing", error: persisted.error };
  }

  const advancedToPersisted = await claimAssessmentProcessingStage({
    assessmentSessionId: session.id,
    expectedStage: "transcribing",
    nextStage: "transcript_persisted",
  });
  if (!advancedToPersisted) {
    return { assessmentSessionId: session.id, outcome: "no_op", stage: "transcribing" };
  }
  return runExtractionStage(session, source);
}

// How long a session may sit at processing_stage='transcribing' with no job handle before a
// worker invocation is allowed to treat it as abandoned and restart staging. Must comfortably
// exceed how long real audio assembly + S3 staging + starting one Transcribe job should ever
// take (see audioAssembly.ts's honesty note on file size) — generous on purpose, since the cost
// of waiting a bit longer is trivial and the cost of guessing wrong (a second, duplicate
// Transcribe job + orphaned S3 objects) is not.
const TRANSCRIBING_STAGE_STALE_AFTER_MS = 3 * 60 * 1000;

async function continueTranscribing(session: AssessmentSessionRecord, source: AudioSourceRow): Promise<AdvanceProcessingResult> {
  if (!source.transcription_job_id || !source.transcription_provider) {
    // Inconsistent checkpoint (stage says "transcribing" but no job handle was ever persisted).
    // This is genuinely ambiguous by stage name alone: it could mean a prior attempt crashed
    // after claiming the stage but before persisting the job id (safe to restart), OR it could
    // mean ANOTHER background stage-worker invocation is, right now, in the middle of exactly
    // that work (audio assembly / S3 staging / starting the Transcribe job) and simply hasn't
    // reached the point of persisting the job id yet — a real possibility now that this stage
    // runs inside a Background Function that can legitimately take real wall-clock time, not a
    // single fast synchronous tick. Restarting unconditionally here would risk starting a
    // second, duplicate AWS Transcribe job. claimStaleTranscribingStageForRestart() only allows
    // the restart once the stage has been held for longer than any real attempt should ever
    // take — otherwise this invocation safely no-ops and leaves the in-flight attempt alone.
    const canRestart = await claimStaleTranscribingStageForRestart({
      assessmentSessionId: session.id,
      staleAfterMs: TRANSCRIBING_STAGE_STALE_AFTER_MS,
    });
    if (!canRestart) {
      return { assessmentSessionId: session.id, outcome: "no_op", stage: "transcribing" };
    }
    return startTranscriptionStage(session, source);
  }

  const handle: TranscriptionJobHandle = {
    providerId: source.transcription_provider,
    jobId: source.transcription_job_id,
    metadata: source.transcription_provider_metadata ?? undefined,
  };
  const provider = getTranscriptionProviderByProviderId(source.transcription_provider);

  const check = await provider.checkTranscription(handle, gateOverrideForSession(session));

  if (check.status === "pending") {
    return { assessmentSessionId: session.id, outcome: "no_op", stage: "transcribing" };
  }

  if (check.status === "failed") {
    await markAssessmentSessionFailed({
      assessmentSessionId: session.id,
      stage: "transcription",
      reason: check.error ?? "Transcription job failed.",
    });
    return { assessmentSessionId: session.id, outcome: "failed", stage: "transcribing", error: check.error };
  }

  const persisted = await persistTranscriptAndOutcome(source, 1, check.result as TranscriptionProviderResult);
  if (!persisted.ok) {
    await markAssessmentSessionFailed({ assessmentSessionId: session.id, stage: "transcription", reason: persisted.error ?? "Transcription failed." });
    return { assessmentSessionId: session.id, outcome: "failed", stage: "transcribing", error: persisted.error };
  }

  const advancedToPersisted = await claimAssessmentProcessingStage({
    assessmentSessionId: session.id,
    expectedStage: "transcribing",
    nextStage: "transcript_persisted",
  });
  if (!advancedToPersisted) {
    return { assessmentSessionId: session.id, outcome: "no_op", stage: "transcribing" };
  }
  return runExtractionStage(session, source);
}

/** Advances ONE assessment session by at most one durable, idempotent step. Never throws for an
 * expected condition (missing session, wrong status, gate blocked, provider failure) — those all
 * become a typed outcome and, where appropriate, a durably-recorded 'failed' session. Safe to
 * call repeatedly, from overlapping invocations, for the same or different sessions.
 *
 * Deliberately takes no gateOverride parameter — the real dispatcher/background-worker path
 * (this function) resolves AWS-processing authorization per-session, from the session's own row
 * (see isSessionAuthorizedForConfiguredTranscriptionProvider), never from a caller-supplied
 * override. A parameter here would be exactly the kind of broad, arbitrary-session bypass this
 * design specifically removes; there is intentionally no way to pass one in anymore. */
export async function advanceAssessmentProcessing(assessmentSessionId: string): Promise<AdvanceProcessingResult> {
  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { assessmentSessionId, outcome: "error", error: "Assessment session not found." };
  if (session.status !== "processing") {
    return { assessmentSessionId, outcome: "not_processing" };
  }

  const source = await getAudioSourceForSession(assessmentSessionId);
  if (!source) {
    await markAssessmentSessionFailed({ assessmentSessionId, stage: "transcription", reason: "No audio source found for this session." });
    return { assessmentSessionId, outcome: "failed", error: "No audio source found." };
  }

  const stage = session.processing_stage ?? "transcription_staging";

  if (stage === "transcript_persisted" || stage === "extracting") {
    return runExtractionStage(session, source);
  }
  if (stage === "transcribing") {
    return continueTranscribing(session, source);
  }
  return startTranscriptionStage(session, source);
}

// ─── Dispatcher (2026-08-15 hardening pass) ─────────────────────────────────────────────────
// Netlify Scheduled Functions have a hard 30-second execution limit — documented, not
// discovered by trial — so the scheduled function must never itself perform the bounded stage
// work (ffmpeg assembly, S3 staging, an AWS Transcribe/Bedrock call). It only finds eligible
// work and hands each item off to a Background Function (up to 15 minutes), which performs
// exactly one resumable stage and returns. See
// netlify/functions/assessment-processing-dispatcher.ts (the scheduled dispatcher) and
// netlify/functions/assessment-processing-stage-worker-background.ts (the bounded stage worker)
// — this function is the shared logic both the real scheduled dispatcher AND the admin-only
// manual trigger (lib/actions/assessmentProcessingAdmin.ts) call, so a manual trigger on a
// Deploy Preview exercises the exact same dispatch path production relies on, not a parallel
// implementation of it.

export interface DispatchOutcome {
  assessmentSessionId: string;
  /** True only means "the background worker accepted the invocation" (an immediate 202-style
   * acknowledgment) — never "the stage finished," since a Background Function's actual result
   * is never delivered back to its invoker. The stage's real outcome is only ever observable via
   * the session's own durable state on a later read (DB row, UI, or a subsequent dispatch). */
  dispatched: boolean;
  error?: string;
}

const STAGE_WORKER_BACKGROUND_PATH = "/.netlify/functions/assessment-processing-stage-worker-background";

/** Netlify sets DEPLOY_PRIME_URL to the correct URL for whatever context this invocation is
 * actually running in — production URL in production, the specific Deploy Preview's own URL on
 * a preview — which is exactly what's needed here: a Deploy Preview's dispatcher must invoke
 * THAT SAME preview's background function, never production's. URL is a same-site fallback for
 * any context where DEPLOY_PRIME_URL is somehow unset. */
function getSiteBaseUrl(): string | null {
  return process.env.DEPLOY_PRIME_URL || process.env.URL || null;
}

async function invokeStageWorker(assessmentSessionId: string): Promise<DispatchOutcome> {
  const baseUrl = getSiteBaseUrl();
  const secret = process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  if (!baseUrl) {
    return {
      assessmentSessionId,
      dispatched: false,
      error: "No site URL available (DEPLOY_PRIME_URL/URL unset) — cannot invoke the background stage worker.",
    };
  }
  if (!secret) {
    return {
      assessmentSessionId,
      dispatched: false,
      error: "Missing ASSESSMENT_PROCESSING_WORKER_SECRET — refusing to invoke the background worker unauthenticated.",
    };
  }

  try {
    // Netlify Background Functions acknowledge (202) almost immediately, before the handler
    // itself finishes running — this fetch resolves as soon as the invocation is accepted, not
    // after the actual stage work (which may run for minutes) completes. Awaiting it here is
    // therefore safe within the dispatcher's own 30-second budget.
    const response = await fetch(`${baseUrl}${STAGE_WORKER_BACKGROUND_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-assessment-worker-secret": secret },
      body: JSON.stringify({ assessmentSessionId }),
    });
    if (!response.ok) {
      return { assessmentSessionId, dispatched: false, error: `Background worker invocation responded ${response.status}.` };
    }
    return { assessmentSessionId, dispatched: true };
  } catch (err) {
    return { assessmentSessionId, dispatched: false, error: err instanceof Error ? err.message : "Unknown error invoking background worker." };
  }
}

/** The dispatcher's entire job, and nothing more: find up to `limit` eligible sessions and fire
 * an async invocation of the background stage worker for each. Never awaits AWS/Bedrock work,
 * never assembles audio, never touches S3 — only a DB read plus a handful of fast
 * fire-and-forget HTTP acknowledgments. Over-dispatching a session that's already being worked
 * on is expected and safe: the background worker's own per-stage claim (and, for the
 * transcribing stage specifically, the stale-lease check) makes a duplicate invocation a
 * harmless no-op rather than duplicate work. */
export async function dispatchEligibleAssessmentProcessing(limit = 5): Promise<DispatchOutcome[]> {
  const sessions = await getSessionsEligibleForProcessing(limit);
  return Promise.all(sessions.map((session) => invokeStageWorker(session.id)));
}
