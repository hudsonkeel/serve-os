import "server-only";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStaticPath from "ffmpeg-static";

// Assembles the durable ~10-second WebM/Opus capture chunks for one assessment into a SINGLE
// WebM file, server-side, before transcription — the Phase 1 architecture decision (2026-08-15,
// Production Assessment Transcription Orchestration): one Transcribe job per assessment, not
// one per chunk.
//
// WHY THIS EXISTS AT ALL: naive byte-concatenation of independent MediaRecorder WebM/Opus
// chunks is unsafe (already documented elsewhere in this codebase — each chunk is its own
// self-contained WebM container with its own EBML header; simply appending the bytes of a
// second chunk after the first does not produce one valid container). Real remuxing is
// required. ffmpeg's concat demuxer (fluent-ffmpeg's mergeToFile, which drives it) reads each
// input's actual stream data and writes ONE valid container with continuous timestamps — the
// standard, correct way to join same-codec media fragments, not a byte-level hack.
//
// ffmpeg-static ships a prebuilt, Lambda/serverless-compatible ffmpeg binary — no system ffmpeg
// install required, matching this deployment's Netlify Functions runtime.
//
// HONESTY NOTE (matching this codebase's existing discipline for every other
// AWS/audio-dependent module): this has been implemented carefully but has NOT been exercised
// against real MediaRecorder WebM/Opus output in this session — no real captured audio was
// available to test against, and fabricating or downloading audio for this purpose was out of
// scope. Verify against a real short recording before relying on it for a live assessment; see
// this scope's completion report.

export interface AssembleInput {
  path: string;
  bytes: ArrayBuffer;
}

export interface AssembledAudio {
  buffer: Buffer;
  mimeType: string;
}

function chunkIndexFromPath(p: string): number {
  const match = p.match(/(\d+)\.webm$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Concatenates chunks (already sorted by chunk index) into one WebM file via ffmpeg's concat
 * demuxer, using a temporary working directory that is always cleaned up, success or failure. */
export async function assembleAudioChunks(chunks: AssembleInput[]): Promise<AssembledAudio> {
  if (chunks.length === 0) {
    throw new Error("assembleAudioChunks() called with zero chunks — nothing to assemble.");
  }

  if (!ffmpegStaticPath) {
    throw new Error(
      "ffmpeg-static did not resolve a binary path for this platform/runtime — audio assembly cannot proceed. This is an environment problem, not a code path to silently skip."
    );
  }
  ffmpeg.setFfmpegPath(ffmpegStaticPath);

  const sorted = [...chunks].sort((a, b) => chunkIndexFromPath(a.path) - chunkIndexFromPath(b.path));

  const workDir = await mkdtemp(path.join(tmpdir(), "serve-assessment-audio-"));
  try {
    const inputFiles: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const filePath = path.join(workDir, `chunk-${String(i).padStart(6, "0")}.webm`);
      await writeFile(filePath, Buffer.from(sorted[i].bytes));
      inputFiles.push(filePath);
    }

    const outputPath = path.join(workDir, `assembled-${randomUUID()}.webm`);

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg();
      for (const file of inputFiles) command.input(file);
      command
        .on("error", (err: Error) => reject(err))
        .on("end", () => resolve())
        .mergeToFile(outputPath, workDir);
    });

    const buffer = await readFile(outputPath);
    return { buffer, mimeType: "audio/webm" };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
