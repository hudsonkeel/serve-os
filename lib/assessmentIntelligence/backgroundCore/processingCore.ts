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
import { getConfiguredExtractionProvider } from "./providerSelection.ts";
import { sanitizeFailureReason } from "../processingQueue.ts";

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
    const sourceId = await getMostRecentSourceIdForSession(assessmentSessionId);
    await runExtractionPipelineForSession(assessmentSessionId, session.resident_id, sourceId ?? "");
    return { assessmentSessionId, outcome: "processed" };
  } catch (err) {
    const reason = sanitizeFailureReason(err);
    await markSessionFailed(assessmentSessionId, reason);
    return { assessmentSessionId, outcome: "failed", error: reason };
  }
}
