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
} from "../data/assessmentIntelligence.ts";
import { transcribeAudioChunks } from "./transcription.ts";
import { isPhiOpenAiProcessingConfirmed, type PhiGateOverride } from "./phiGovernance.ts";
import { getConfiguredExtractionProvider } from "./providerSelection.ts";

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
