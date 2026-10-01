// Captured audio → per-run media (pure; no I/O). Capture-client agnostic: consumes only the
// canonical stored-object model ({sessionId}/{chunkIndex:6}_{runId}.{ext} in intake-audio plus
// each object's stored MIME type), never anything browser-specific.
//
// A "run" is one recorder instance's continuous output. Runs are reconstructed SEPARATELY and are
// never concatenated with each other — independent MediaRecorder runs are independent containers.
// Within a run, timeslice chunks are one stream split into pieces: only the first carries the
// container header. Plain byte concatenation of one WebM run is proven (a recovered six-chunk
// WebM/Opus run decoded cleanly, continuous timestamps, zero errors); for other containers it is
// NOT proven, so multi-chunk runs of those formats fail closed with a clear reason rather than
// producing media nobody has validated.

import { mimeTypeToExtension, normalizeMimeType, type StoredChunk } from "../../../assessmentCapture/captureLogic.ts";

/** Transcribe MediaFormat by file extension. AAC (ADTS) is not a Transcribe input format. */
export const TRANSCRIBE_MEDIA_FORMATS: Readonly<Record<string, string>> = {
  webm: "webm",
  mp4: "mp4",
  m4a: "m4a",
  ogg: "ogg",
  mp3: "mp3",
  wav: "wav",
};

/** Formats for which byte-concatenating a run's chunks has been proven to yield valid media. */
export const MULTI_CHUNK_CONCAT_VALIDATED = new Set(["webm"]);

export interface AudioRunPlan {
  runId: string;
  order: number; // 1-based, chronological (by first chunk index)
  chunkNames: string[];
  chunkIndexes: number[];
  firstChunkIndex: number;
  lastChunkIndex: number;
  mimeType: string;
  extension: string;
  mediaFormat: string;
  totalBytes: number;
  /** Indexes missing inside this run's own span (audio lost on-device), reported not repaired. */
  internalGaps: number[];
}

export type AudioRunPlanResult = { ok: true; runs: AudioRunPlan[] } | { ok: false; reason: string };

export function mediaFormatForMime(mimeType: string | null | undefined): { extension: string; mediaFormat: string } | null {
  const ext = mimeTypeToExtension(mimeType);
  if (!ext) return null;
  const mediaFormat = TRANSCRIBE_MEDIA_FORMATS[ext];
  return mediaFormat ? { extension: ext, mediaFormat } : null;
}

/** Groups stored chunks into runs, deterministically ordered, and verifies everything that can be
 * verified without bytes. Any ambiguity fails closed with a reason — never a guess. */
export function planAudioRuns(chunks: readonly StoredChunk[]): AudioRunPlanResult {
  if (chunks.length === 0) return { ok: false, reason: "No captured audio was found for this assessment." };
  if (chunks.some((c) => c.runId === null)) {
    return { ok: false, reason: "Captured audio includes objects not written by Serve OS capture; refusing to guess their order." };
  }

  const byIndex = new Map<number, number>();
  for (const c of chunks) byIndex.set(c.chunkIndex, (byIndex.get(c.chunkIndex) ?? 0) + 1);
  const duplicates = [...byIndex.entries()].filter(([, n]) => n > 1).map(([i]) => i);
  if (duplicates.length > 0) return { ok: false, reason: `Captured audio has more than one object at chunk index ${duplicates.sort((a, b) => a - b).join(", ")}.` };

  const groups = new Map<string, StoredChunk[]>();
  for (const c of chunks) {
    const list = groups.get(c.runId as string) ?? [];
    list.push(c);
    groups.set(c.runId as string, list);
  }

  const runs: Omit<AudioRunPlan, "order" | "internalGaps">[] = [];
  for (const [runId, list] of groups) {
    const sorted = [...list].sort((a, b) => a.chunkIndex - b.chunkIndex);
    const mimes = new Set(sorted.map((c) => normalizeMimeType(c.mimeType)).filter((m): m is string => Boolean(m)));
    const extensions = new Set(sorted.map((c) => c.extension));
    if (mimes.size > 1 || extensions.size > 1) {
      return { ok: false, reason: `Recording part ${runId} mixes audio formats; refusing to combine them.` };
    }
    const mimeType = [...mimes][0] ?? null;
    const format = mediaFormatForMime(mimeType) ?? mediaFormatForMime(`audio/${[...extensions][0]}`);
    if (!format) return { ok: false, reason: `Recording part ${runId} uses an audio format (${mimeType ?? "unknown"}) AWS Transcribe cannot accept.` };
    if (sorted.some((c) => typeof c.size !== "number" || c.size <= 0)) {
      return { ok: false, reason: `Recording part ${runId} has a chunk with no recorded size.` };
    }
    runs.push({
      runId,
      chunkNames: sorted.map((c) => c.name),
      chunkIndexes: sorted.map((c) => c.chunkIndex),
      firstChunkIndex: sorted[0].chunkIndex,
      lastChunkIndex: sorted[sorted.length - 1].chunkIndex,
      mimeType: mimeType ?? `audio/${format.extension}`,
      extension: format.extension,
      mediaFormat: format.mediaFormat,
      totalBytes: sorted.reduce((sum, c) => sum + (c.size ?? 0), 0),
    });
  }

  runs.sort((a, b) => a.firstChunkIndex - b.firstChunkIndex);
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].firstChunkIndex <= runs[i - 1].lastChunkIndex) {
      return { ok: false, reason: "Two recording parts overlap in chunk order (likely recorded concurrently); refusing to guess their order." };
    }
  }

  return {
    ok: true,
    runs: runs.map((r, i) => {
      const own = new Set(r.chunkIndexes);
      const internalGaps: number[] = [];
      for (let idx = r.firstChunkIndex; idx <= r.lastChunkIndex; idx++) if (!own.has(idx)) internalGaps.push(idx);
      return { ...r, order: i + 1, internalGaps };
    }),
  };
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

const EBML_HEADER = [0x1a, 0x45, 0xdf, 0xa3];
const FTYP = [0x66, 0x74, 0x79, 0x70]; // "ftyp" at byte offset 4
const OGGS = [0x4f, 0x67, 0x67, 0x53];

export function hasContainerHeader(extension: string, bytes: Uint8Array): boolean {
  switch (extension) {
    case "webm":
      return startsWith(bytes, EBML_HEADER);
    case "mp4":
    case "m4a":
      return startsWith(bytes, FTYP, 4);
    case "ogg":
      return startsWith(bytes, OGGS);
    default:
      return bytes.length > 0;
  }
}

export type RunReconstruction = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

/** Rebuilds ONE run's media from its chunks' exact bytes, in chunk order. The first chunk must
 * carry the container header; a header appearing again mid-run means it isn't one stream (fail
 * closed). Multi-chunk runs are only concatenated for formats where that's been validated. */
export function reconstructRun(run: Pick<AudioRunPlan, "runId" | "extension" | "chunkIndexes">, chunkBytes: readonly Uint8Array[]): RunReconstruction {
  if (chunkBytes.length !== run.chunkIndexes.length || chunkBytes.length === 0) {
    return { ok: false, reason: `Recording part ${run.runId}: expected ${run.chunkIndexes.length} chunk(s), received ${chunkBytes.length}.` };
  }
  if (!hasContainerHeader(run.extension, chunkBytes[0])) {
    return { ok: false, reason: `Recording part ${run.runId}: the first chunk does not begin with a ${run.extension} container header.` };
  }
  if (chunkBytes.length > 1) {
    if (!MULTI_CHUNK_CONCAT_VALIDATED.has(run.extension)) {
      return {
        ok: false,
        reason: `Recording part ${run.runId}: reassembling multi-segment ${run.extension} audio has not been validated yet, so it was not attempted.`,
      };
    }
    for (let i = 1; i < chunkBytes.length; i++) {
      if (hasContainerHeader(run.extension, chunkBytes[i])) {
        return { ok: false, reason: `Recording part ${run.runId}: chunk ${run.chunkIndexes[i]} starts a new container, so this is not one continuous stream.` };
      }
    }
  }
  const total = chunkBytes.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of chunkBytes) {
    out.set(b, offset);
    offset += b.length;
  }
  return { ok: true, bytes: out };
}
