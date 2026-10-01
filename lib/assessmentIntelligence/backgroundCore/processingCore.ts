import {
  getAssessmentSession,
  getCombinedTranscriptText,
  writeDraftFacts,
  detectAndRecordConflicts,
  getOpenConflictsForSession,
  updateAssessmentSessionStatus,
  claimSessionForProcessing,
  markSessionFailed,
  getMostRecentSourceIdForSession,
  recordProcessingDiagnosticStage,
} from "./dataAccess.ts";
import { getConfiguredExtractionProvider, getExtractionProviderByKey } from "./providerSelection.ts";
import { sanitizeFailureReason } from "../processingQueue.ts";
import { decideExtractionPolicy } from "./extractionPolicy.ts";
import { decideAwsAssessmentAuthorization } from "../phiGovernance.ts";
import type { AssessmentExtractionProvider } from "../extractionProvider.ts";
import { sessionHasLiveAudioSource } from "./transcription/transcriptionStore.ts";
import { advanceCapturedAssessmentTranscription, retryCapturedAssessmentTranscriptionCleanup } from "./transcription/transcriptionRuntime.ts";

// Background-safe processing core (2026-09-17 architecture change). Deliberately carries NO
// `import "server-only"` and NO React/Next dependency — see dataAccess.ts's header comment for
// the full rationale. This is what makes advanceQueuedAssessmentProcessing() safely importable
// directly from netlify/functions/assessment-processing-stage-worker-background.mts, replacing
// the same-site HTTP callback architecture (Background Function -> fetch() ->
// app/api/assessment-processing/worker Route Handler) abandoned after three separate live tests
// each stalled at that exact same-site fetch, with no resolution or rejection, across three
// different attempted fixes. See that .mts file's own header comment for the investigation this
// followed.
//
// lib/assessmentIntelligence/pipeline.ts (Next-facing, still `import "server-only"`) re-exports
// everything here so every existing Next.js Server Action/Route Handler import is unaffected —
// this is the one implementation, never duplicated between the two files.

export interface ExtractionPipelineResult {
  error?: string;
  draftFactCount?: number;
  rejectedCount?: number;
}

/** The shared tail of both entry points into extraction (pasted-transcript admin/test fallback,
 * via advanceQueuedAssessmentProcessing() below, and the real captured-audio pipeline in
 * pipeline.ts's transcribeAndExtractAssessmentAudio()) — one pipeline, two ways in, per the
 * source-agnostic boundary this was designed around from the start (docs/architecture/
 * ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §3A). Provider-neutral: this function calls
 * through providerSelection.ts, never a specific provider module directly — see docs/
 * architecture/BEDROCK_CLAUDE_PROVIDER.md. */
export async function runExtractionPipelineForSession(
  assessmentSessionId: string,
  residentId: string,
  sourceId: string,
  /** The provider extractionPolicy.ts allowed for this assessment. Omitted only by the legacy
   * webhook path (pipeline.ts transcribeAndExtractAssessmentAudio), which keeps its behavior. */
  providerOverride?: AssessmentExtractionProvider
): Promise<ExtractionPipelineResult> {
  const combinedText = await getCombinedTranscriptText(assessmentSessionId);
  const provider = providerOverride ?? getConfiguredExtractionProvider();
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

export interface AdvanceProcessingResult {
  assessmentSessionId: string;
  outcome: "processed" | "not_eligible" | "failed";
  error?: string;
}

/** The background worker's entire job: claim one queued session, run the existing extraction
 * pipeline unchanged, and durably record the outcome either way. Called directly, in-process,
 * by netlify/functions/assessment-processing-stage-worker-background.mts after it verifies the
 * shared secret — no HTTP hop, no Route Handler, in this process's own execution context (a
 * Netlify Background Function, with its real ~15-minute budget). */
export async function advanceQueuedAssessmentProcessing(assessmentSessionId: string): Promise<AdvanceProcessingResult> {
  // Diagnostic-only breadcrumb, written before the claim is known to have succeeded -- proves
  // the background handler itself actually reached real processing logic (never blocks or fails
  // this real path; see recordProcessingDiagnosticStage()'s own comment).
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
    // Decide WHICH provider may see this transcript before any provider is called: never an
    // empty transcript (no empty drafts); audio-derived assessments are AWS-only (explicit
    // bedrock + AWS PHI gate), never a silent OpenAI default.
    const policy = decideExtractionPolicy({
      transcriptText: await getCombinedTranscriptText(assessmentSessionId),
      audioDerived: await sessionHasLiveAudioSource(assessmentSessionId),
      configuredProvider: process.env.ASSESSMENT_EXTRACTION_PROVIDER,
      awsAuthorization: decideAwsAssessmentAuthorization({ isSyntheticTest: session.is_synthetic_test === true }),
    });
    if (!policy.ok) {
      const reason = sanitizeFailureReason(new Error(policy.reason));
      await markSessionFailed(assessmentSessionId, reason);
      return { assessmentSessionId, outcome: "failed", error: reason };
    }
    const sourceId = await getMostRecentSourceIdForSession(assessmentSessionId);
    await runExtractionPipelineForSession(assessmentSessionId, session.resident_id, sourceId ?? "", getExtractionProviderByKey(policy.providerKey));
    return { assessmentSessionId, outcome: "processed" };
  } catch (err) {
    const reason = sanitizeFailureReason(err);
    await markSessionFailed(assessmentSessionId, reason);
    return { assessmentSessionId, outcome: "failed", error: reason };
  }
}

export interface AdvanceSessionResult {
  assessmentSessionId: string;
  route: "transcription" | "extraction" | "cleanup" | "none";
  outcome: string;
  error?: string;
}

/** The background worker's single entry point: routes by the session's durable status.
 *   captured -> transcription step (and, once the transcript is durable and the session is
 *               queued, straight into the existing extraction step in the same invocation);
 *   queued   -> the existing extraction step, unchanged;
 *   anything else -> retry any pending temporary-artifact cleanup (no-op otherwise). */
export async function advanceAssessmentSession(assessmentSessionId: string): Promise<AdvanceSessionResult> {
  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { assessmentSessionId, route: "none", outcome: "not_found" };

  if (session.status === "captured") {
    const t = await advanceCapturedAssessmentTranscription(assessmentSessionId);
    if (t.outcome !== "queued") {
      return { assessmentSessionId, route: "transcription", outcome: t.outcome, error: "reason" in t ? t.reason : undefined };
    }
    const e = await advanceQueuedAssessmentProcessing(assessmentSessionId);
    return { assessmentSessionId, route: "extraction", outcome: e.outcome, error: e.error };
  }

  if (session.status === "queued") {
    const e = await advanceQueuedAssessmentProcessing(assessmentSessionId);
    return { assessmentSessionId, route: "extraction", outcome: e.outcome, error: e.error };
  }

  const c = await retryCapturedAssessmentTranscriptionCleanup(assessmentSessionId).catch(() => "pending" as const);
  return { assessmentSessionId, route: "cleanup", outcome: c };
}
