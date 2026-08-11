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
} from "../data/assessmentIntelligence.ts";
import { extractFactsFromTranscript } from "./extraction.ts";
import { transcribeAudioChunks } from "./transcription.ts";
import { isPhiOpenAiProcessingConfirmed } from "./phiGovernance.ts";

// The shared tail of both entry points into extraction (pasted-transcript admin/test fallback,
// and the real captured-audio pipeline below) — one pipeline, two ways in, per the
// source-agnostic boundary this was designed around from the start (docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §3A).

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
  const extraction = await extractFactsFromTranscript(combinedText);

  if (extraction.rawResponseParseError) {
    return { error: `Extraction failed to parse a valid response: ${extraction.rawResponseParseError}` };
  }

  const runRef = `extraction-${Date.now()}`;
  await writeDraftFacts({
    assessmentSessionId,
    sourceId,
    facts: extraction.accepted,
    extractionRunRef: runRef,
    modelVersion: extraction.modelVersion,
  });

  await detectAndRecordConflicts(residentId, assessmentSessionId);

  const openConflicts = await getOpenConflictsForSession(assessmentSessionId);
  await updateAssessmentSessionStatus(assessmentSessionId, openConflicts.length > 0 ? "needs_review" : "draft");

  return { draftFactCount: extraction.accepted.length, rejectedCount: extraction.rejected.length };
}

export interface TranscribeAndExtractResult {
  error?: string;
  phiGateBlocked?: boolean;
  chunksTranscribed?: number;
  chunksFailed?: number;
  draftFactCount?: number;
  rejectedCount?: number;
}

/** Service-to-service entry point for the captured-audio pipeline — called only from
 * app/api/intake/transcribe/route.ts after that route has verified the shared webhook secret.
 * Deliberately NOT exported from a "use server" actions file: this function has no human-session
 * check (there is no Serve OS user in a webhook call from serve-intake-mvp), so it must never be
 * reachable as a directly callable Next.js Server Action. */
export async function transcribeAndExtractAssessmentAudio(assessmentSessionId: string): Promise<TranscribeAndExtractResult> {
  if (!isPhiOpenAiProcessingConfirmed()) {
    return {
      error:
        "PHI_OPENAI_PROCESSING_CONFIRMED is not set to 'true' — real captured audio may not be transcribed until a human has confirmed the BAA is executed and Modified Retention is provisioned.",
      phiGateBlocked: true,
    };
  }

  const source = await getAudioSourceForSession(assessmentSessionId);
  if (!source) return { error: "No audio source found for this assessment session." };
  if (source.status !== "uploaded") {
    return { error: `Audio source status is '${source.status}', not yet 'uploaded' — nothing to transcribe.` };
  }

  const session = await getAssessmentSession(assessmentSessionId);
  if (!session) return { error: "Assessment session not found." };

  const chunks = await downloadAudioChunksForSession(assessmentSessionId);
  if (chunks.length === 0) return { error: "No audio chunks found in storage for this session." };

  const transcription = await transcribeAudioChunks(
    chunks.map((c) => ({ path: c.path, bytes: c.bytes, mimeType: c.mimeType }))
  );

  if (transcription.segments.length === 0) {
    return {
      error: "Transcription produced no usable text from any chunk.",
      chunksTranscribed: 0,
      chunksFailed: transcription.failedChunks.length,
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

  const pipelineResult = await runExtractionPipelineForSession(assessmentSessionId, session.resident_id, source.id);

  return {
    ...pipelineResult,
    chunksTranscribed: transcription.segments.length,
    chunksFailed: transcription.failedChunks.length,
  };
}
