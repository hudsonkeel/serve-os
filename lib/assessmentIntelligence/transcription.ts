import "server-only";
import OpenAI, { toFile } from "openai";
import { requirePhiOpenAiProcessingConfirmed, type PhiGateOverride } from "./phiGovernance.ts";

// Transcribes captured audio chunks into text segments — the second half of the
// source-agnostic transcript boundary (docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §3A / docs/architecture/
// AUDIO_TRANSCRIPTION_PIPELINE.md). Each chunk is transcribed independently (no cross-chunk
// context window) — a known, documented limitation, not an oversight; see the architecture
// note for why concatenating raw webm chunks isn't safe to do instead.
//
// requirePhiOpenAiProcessingConfirmed() is called before any network call here. This module
// must never be reached for real captured audio until a human has explicitly confirmed the BAA
// and Modified Retention are in place — see phiGovernance.ts.

let cachedClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY — required for audio transcription. Not fabricated; add it to configure this capability.");
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

const MODEL = "gpt-4o-transcribe";

export interface AudioChunk {
  path: string;
  bytes: ArrayBuffer;
  mimeType: string;
}

export interface TranscribedSegment {
  text: string;
  chunkIndex: number;
  sourcePath: string;
}

export interface TranscriptionResult {
  segments: TranscribedSegment[];
  modelVersion: string;
  failedChunks: { path: string; error: string }[];
}

export function chunkIndexFromPath(path: string): number {
  const match = path.match(/(\d+)\.webm$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Transcribes each chunk independently via the real OpenAI audio API. Never called for real
 * captured audio unless requirePhiOpenAiProcessingConfirmed() has already passed — callers must
 * not skip that check; it is re-asserted here too, defensively, since this function is the one
 * place a network call to OpenAI with real audio bytes would actually happen. */
export async function transcribeAudioChunks(chunks: AudioChunk[], gateOverride?: PhiGateOverride): Promise<TranscriptionResult> {
  requirePhiOpenAiProcessingConfirmed(gateOverride);

  if (chunks.length === 0) {
    return { segments: [], modelVersion: MODEL, failedChunks: [] };
  }

  const openai = getOpenAiClient();
  const sorted = [...chunks].sort((a, b) => chunkIndexFromPath(a.path) - chunkIndexFromPath(b.path));

  const segments: TranscribedSegment[] = [];
  const failedChunks: { path: string; error: string }[] = [];

  for (const chunk of sorted) {
    try {
      const file = await toFile(Buffer.from(chunk.bytes), chunk.path.split("/").pop() ?? "chunk.webm", {
        type: chunk.mimeType,
      });
      const response = await openai.audio.transcriptions.create({ file, model: MODEL });
      const text = (response as { text?: string }).text ?? "";
      if (text.trim()) {
        segments.push({ text: text.trim(), chunkIndex: chunkIndexFromPath(chunk.path), sourcePath: chunk.path });
      }
    } catch (err) {
      failedChunks.push({ path: chunk.path, error: err instanceof Error ? err.message : "Unknown transcription error" });
    }
  }

  return { segments, modelVersion: MODEL, failedChunks };
}

export { MODEL as TRANSCRIPTION_MODEL };
