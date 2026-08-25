import "server-only";
import { transcribeAudioChunks, TRANSCRIPTION_MODEL, type AudioChunk } from "../transcription.ts";
import type {
  AssessmentTranscriptionProvider,
  AudioChunkInput,
  TranscriptionGateOverride,
  TranscriptionJobHandle,
  TranscriptionStartOutcome,
  TranscriptionStatusOutcome,
} from "../transcriptionProvider.ts";

// Thin adapter — wraps the existing, unchanged transcription.ts (OpenAI Whisper
// gpt-4o-transcribe) behind the two-phase provider-neutral interface. transcription.ts itself
// and its own PHI gate call (requirePhiOpenAiProcessingConfirmed, still OpenAI-named and
// OpenAI-specific) are untouched; this file adds zero new behavior. OpenAI's API is genuinely
// synchronous (upload bytes, get text back per chunk) — startTranscription() does the real work
// immediately and always returns status: "completed". checkTranscription() is never reachable
// in practice (the worker never persists a "pending" handle for this provider) and throws if
// ever called, defensively, rather than silently returning a fabricated result.
export const openAiTranscriptionProvider: AssessmentTranscriptionProvider = {
  providerId: "openai",
  modelId: TRANSCRIPTION_MODEL,

  async startTranscription(
    chunks: AudioChunkInput[],
    gateOverride?: TranscriptionGateOverride
  ): Promise<TranscriptionStartOutcome> {
    const result = await transcribeAudioChunks(chunks as AudioChunk[], gateOverride);
    return {
      status: "completed",
      handle: { providerId: "openai", jobId: `openai-sync-${Date.now()}` },
      result: {
        segments: result.segments,
        provider: "openai",
        modelId: result.modelVersion,
        failedChunks: result.failedChunks,
      },
    };
  },

  async checkTranscription(handle: TranscriptionJobHandle): Promise<TranscriptionStatusOutcome> {
    throw new Error(
      `openAiTranscriptionProvider.checkTranscription() should never be called (got jobId "${handle.jobId}") — startTranscription() always completes synchronously and is never left in a 'pending' state to resume.`
    );
  },
};
