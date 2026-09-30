// Assessment Mobile Capture v0.1 — pure decision core for native (in-browser) assessment capture.
//
// No I/O, no DOM, no `server-only`: everything here is a deterministic function of its inputs, so
// the same rules are shared by the browser (CaptureScreen), the server actions
// (lib/actions/nativeAssessmentCapture.ts), the data layer (lib/data/nativeAssessmentCapture.ts),
// and the node test runner. Mirrors the pure/I-O split already used by processingQueue.ts and
// communityResolution.ts.
//
// Scope of this slice: capture terminates at status 'captured' (audio durably stored, transcription
// not begun). Nothing in this module can ever produce 'queued' — see decideCaptureFinalize().
// Original recorded blobs are preserved exactly: this module names and verifies them, it never
// concatenates, remuxes, or transcodes anything.

import { canCaptureResidentAssessment, canUseMobileCapturePilot } from "../auth/permissions.ts";
import type { AuthRole } from "../auth/constants.ts";

export const CAPTURED_SESSION_STATUS = "captured" as const;
export const RECORDING_SESSION_STATUS = "recording" as const;
export const INTAKE_AUDIO_BUCKET = "intake-audio";
export const NATIVE_CAPTURE_ORIGIN = "serve_os_native_capture";
export const NATIVE_CAPTURE_VERSION = "mobile-capture-pilot-v0.1";
export const CHUNK_TIMESLICE_MS = 10_000;
export const MAX_CHUNK_INDEX = 999_999;
export const CHUNK_DOWNLOAD_URL_TTL_SECONDS = 300;

// ─── Status labels ────────────────────────────────────────────────────────────────────────────
// The one operator-facing vocabulary for assessment session status (moved here from
// AssessmentSection.tsx so it's testable and shared). Deliberately free of queue/AWS terminology.
export const ASSESSMENT_SESSION_STATUS_LABELS: Readonly<Record<string, string>> = {
  recording: "Recording",
  captured: "Audio captured — awaiting transcription",
  queued: "Queued",
  processing: "Processing",
  failed: "Failed",
  draft: "Draft — needs review",
  needs_review: "Needs review",
  approved: "Approved",
  amended: "Amended",
  operationalized: "Operationalized",
};

export function assessmentSessionStatusLabel(status: string): string {
  return ASSESSMENT_SESSION_STATUS_LABELS[status] ?? status;
}

// ─── MIME types and object naming ─────────────────────────────────────────────────────────────

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** "audio/webm;codecs=opus" -> "audio/webm". Lower-cased, parameters stripped. */
export function normalizeMimeType(mimeType: string | null | undefined): string | null {
  if (typeof mimeType !== "string") return null;
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return base.length > 0 ? base : null;
}

/** The object-name extension for a recorded MIME type, or null if it's not a supported audio
 * container. Never guesses: an unknown type is refused rather than mislabelled as .webm (the
 * old branch's defect — iOS Safari records audio/mp4). */
export function mimeTypeToExtension(mimeType: string | null | undefined): string | null {
  const base = normalizeMimeType(mimeType);
  return base ? MIME_EXTENSIONS[base] ?? null : null;
}

/** Preference order for MediaRecorder. The first type the browser supports wins; the recorder's
 * own reported mimeType (not this guess) is what gets stored with each chunk. */
export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/aac",
];

export function pickRecorderMimeType(isTypeSupported: ((type: string) => boolean) | null | undefined): string {
  if (!isTypeSupported) return "";
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate;
    } catch {
      // A throwing isTypeSupported is treated as "not supported", never fatal.
    }
  }
  return "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_ID_RE = /^[a-z0-9]{8,32}$/;

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isValidRunId(value: unknown): value is string {
  return typeof value === "string" && RUN_ID_RE.test(value);
}

export function isValidChunkIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_CHUNK_INDEX;
}

function padChunkIndex(chunkIndex: number): string {
  return String(chunkIndex).padStart(6, "0");
}

/** Opaque object path inside the private intake-audio bucket:
 *   {sessionId}/{chunkIndex:6}_{runId}.{ext}
 * Index first so a lexical listing is also chunk order; runId identifies which MediaRecorder
 * instance produced the blob; the extension reflects the real recorded container. No resident
 * identity anywhere in the path (same convention as the existing capture flow). */
export function buildChunkObjectPath(input: {
  sessionId: string;
  chunkIndex: number;
  runId: string;
  mimeType: string;
}): string {
  if (!isValidSessionId(input.sessionId)) throw new Error("Invalid assessment session id for chunk path.");
  if (!isValidChunkIndex(input.chunkIndex)) throw new Error("Invalid chunk index for chunk path.");
  if (!isValidRunId(input.runId)) throw new Error("Invalid recorder run id for chunk path.");
  const ext = mimeTypeToExtension(input.mimeType);
  if (!ext) throw new Error("Unsupported audio MIME type for chunk path.");
  return `${input.sessionId}/${padChunkIndex(input.chunkIndex)}_${input.runId}.${ext}`;
}

export interface StorageObjectInfo {
  /** Object name within the session folder (no folder prefix). */
  name: string;
  size: number | null;
  mimeType: string | null;
  createdAt: string | null;
}

export interface StoredChunk {
  name: string;
  chunkIndex: number;
  /** Null only for a legacy "{index}.webm" object not written by native capture. */
  runId: string | null;
  extension: string;
  size: number | null;
  mimeType: string | null;
  createdAt: string | null;
}

const NATIVE_NAME_RE = /^(\d{6})_([a-z0-9]{8,32})\.([a-z0-9]{2,5})$/;
const LEGACY_NAME_RE = /^(\d{1,6})\.(webm)$/;

export function parseChunkObjectName(name: string): { chunkIndex: number; runId: string | null; extension: string } | null {
  const native = NATIVE_NAME_RE.exec(name);
  if (native) return { chunkIndex: parseInt(native[1], 10), runId: native[2], extension: native[3] };
  const legacy = LEGACY_NAME_RE.exec(name);
  if (legacy) return { chunkIndex: parseInt(legacy[1], 10), runId: null, extension: legacy[2] };
  return null;
}

export function parseStoredChunks(objects: readonly StorageObjectInfo[]): { chunks: StoredChunk[]; unrecognized: string[] } {
  const chunks: StoredChunk[] = [];
  const unrecognized: string[] = [];
  for (const object of objects) {
    const parsed = parseChunkObjectName(object.name);
    if (!parsed) {
      unrecognized.push(object.name);
      continue;
    }
    chunks.push({ name: object.name, ...parsed, size: object.size, mimeType: object.mimeType, createdAt: object.createdAt });
  }
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex || a.name.localeCompare(b.name));
  return { chunks, unrecognized };
}

// ─── Chunk indexing ───────────────────────────────────────────────────────────────────────────

export interface ChunkIndexAnalysis {
  count: number;
  distinctCount: number;
  duplicates: number[];
  gaps: number[];
  maxIndex: number | null;
}

/** Duplicates (the same index stored more than once) and gaps (indexes missing between 0 and the
 * highest index) — reported, never silently repaired. */
export function analyzeChunkIndexes(indexes: readonly number[]): ChunkIndexAnalysis {
  const seen = new Map<number, number>();
  for (const i of indexes) seen.set(i, (seen.get(i) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([i]) => i).sort((a, b) => a - b);
  const maxIndex = indexes.length > 0 ? Math.max(...indexes) : null;
  const gaps: number[] = [];
  if (maxIndex !== null) {
    for (let i = 0; i <= maxIndex; i++) if (!seen.has(i)) gaps.push(i);
  }
  return { count: indexes.length, distinctCount: seen.size, duplicates, gaps, maxIndex };
}

/** The next chunk index to allocate: strictly greater than every index already on the server
 * AND every index already persisted on this device (which may include chunks recorded before a
 * reload that haven't uploaded yet). Indexes only ever increase across reloads and recorder runs
 * — an index is never reused, which is what makes "same index, different content" detectable as a
 * conflict rather than a silent overwrite. */
export function deriveNextChunkIndex(serverIndexes: readonly number[], localIndexes: readonly number[] = []): number {
  let max = -1;
  for (const i of serverIndexes) if (i > max) max = i;
  for (const i of localIndexes) if (i > max) max = i;
  return max + 1;
}

// ─── Resume ───────────────────────────────────────────────────────────────────────────────────

export interface RecordingSessionCandidate {
  id: string;
  startedAt: string;
  /** True only when the session's live_audio_stream source carries NATIVE_CAPTURE_ORIGIN. */
  isNativeCapture: boolean;
}

export interface CaptureSessionLookup {
  sessions: readonly RecordingSessionCandidate[];
  error?: string;
}

export type CaptureSessionResumeDecision =
  | { kind: "resume"; sessionId: string }
  | { kind: "create" }
  | { kind: "blocked"; error: string }
  | { kind: "error"; error: string };

export const FOREIGN_RECORDING_SESSION_MESSAGE =
  "This person already has an in-progress assessment from the existing capture flow. The mobile capture pilot will not modify it — use a different (fictional) test record.";

/** Ported from feature/assessment-aws-transcription-pipeline (43709f5) and adapted:
 *  - a lookup ERROR always yields "error", never "create" — a failed lookup must never silently
 *    start a duplicate session (the original defect);
 *  - only a NATIVE capture session is ever resumed;
 *  - an in-progress session from any other capture flow blocks the pilot outright rather than
 *    being resumed (appending audio to it) or shadowed by a second concurrent session. */
export function decideCaptureSessionResume(lookup: CaptureSessionLookup): CaptureSessionResumeDecision {
  if (lookup.error) return { kind: "error", error: lookup.error };
  const foreign = lookup.sessions.filter((s) => !s.isNativeCapture);
  if (foreign.length > 0) return { kind: "blocked", error: FOREIGN_RECORDING_SESSION_MESSAGE };
  const native = [...lookup.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (native.length > 0) return { kind: "resume", sessionId: native[0].id };
  return { kind: "create" };
}

// ─── Per-chunk upload idempotency ─────────────────────────────────────────────────────────────

export interface ChunkUploadRequest {
  chunkIndex: number;
  runId: string;
  mimeType: string;
  size: number;
}

export type ChunkUploadDecision =
  | { kind: "upload"; path: string }
  | { kind: "already_uploaded"; path: string }
  | { kind: "conflict"; reason: string }
  | { kind: "invalid"; reason: string };

export function validateChunkUploadRequest(request: ChunkUploadRequest): string | null {
  if (!isValidChunkIndex(request.chunkIndex)) return "Invalid chunk index.";
  if (!isValidRunId(request.runId)) return "Invalid recorder run id.";
  if (!mimeTypeToExtension(request.mimeType)) return "Unsupported audio type.";
  if (typeof request.size !== "number" || !Number.isInteger(request.size) || request.size <= 0) return "Invalid chunk size.";
  return null;
}

/** Decides what to do with one locally-persisted chunk given every object already stored at the
 * same chunk index. Never overwrites: an existing object whose metadata matches the expected
 * chunk (same run, same byte size, compatible type) is idempotent success; anything else at that
 * index is a conflict that must stop retrying rather than loop forever. */
export function decideChunkUpload(
  sessionId: string,
  request: ChunkUploadRequest,
  existingAtIndex: readonly StoredChunk[]
): ChunkUploadDecision {
  const invalid = validateChunkUploadRequest(request);
  if (invalid) return { kind: "invalid", reason: invalid };
  const path = buildChunkObjectPath({ sessionId, ...request });
  const sameIndex = existingAtIndex.filter((c) => c.chunkIndex === request.chunkIndex);
  if (sameIndex.length === 0) return { kind: "upload", path };
  if (sameIndex.length > 1) return { kind: "conflict", reason: "More than one object is already stored at this chunk index." };
  const existing = sameIndex[0];
  if (existing.runId !== request.runId) {
    return { kind: "conflict", reason: "A different recording already occupies this chunk index." };
  }
  if (existing.size !== request.size) {
    return { kind: "conflict", reason: "An object with a different size already exists for this chunk." };
  }
  const existingType = normalizeMimeType(existing.mimeType);
  if (existingType && existingType !== normalizeMimeType(request.mimeType)) {
    return { kind: "conflict", reason: "An object with a different audio type already exists for this chunk." };
  }
  return { kind: "already_uploaded", path };
}

// ─── Finalize ─────────────────────────────────────────────────────────────────────────────────

export interface FinalizeManifestEntry {
  chunkIndex: number;
  runId: string;
  mimeType: string;
  size: number;
  /** Epoch ms when the blob was produced on the device. */
  recordedAt: number;
}

export interface CapturedRunSummary {
  runId: string;
  chunkCount: number;
  totalBytes: number;
  firstChunkIndex: number;
  lastChunkIndex: number;
  mimeTypes: string[];
}

export interface CapturedAudioSummary {
  chunkCount: number;
  totalBytes: number;
  mimeTypes: string[];
  runCount: number;
  runs: CapturedRunSummary[];
  chunkIndexes: number[];
  gaps: number[];
  duplicates: number[];
  legacyObjectCount: number;
  unrecognizedObjectCount: number;
}

export function summarizeStoredChunks(chunks: readonly StoredChunk[], unrecognizedCount = 0): CapturedAudioSummary {
  const runs = new Map<string, CapturedRunSummary>();
  const mimeTypes = new Set<string>();
  let totalBytes = 0;
  let legacyObjectCount = 0;
  for (const c of chunks) {
    const size = c.size ?? 0;
    totalBytes += size;
    const mime = normalizeMimeType(c.mimeType);
    if (mime) mimeTypes.add(mime);
    if (c.runId === null) {
      legacyObjectCount++;
      continue;
    }
    const run = runs.get(c.runId) ?? {
      runId: c.runId,
      chunkCount: 0,
      totalBytes: 0,
      firstChunkIndex: c.chunkIndex,
      lastChunkIndex: c.chunkIndex,
      mimeTypes: [],
    };
    run.chunkCount++;
    run.totalBytes += size;
    run.firstChunkIndex = Math.min(run.firstChunkIndex, c.chunkIndex);
    run.lastChunkIndex = Math.max(run.lastChunkIndex, c.chunkIndex);
    if (mime && !run.mimeTypes.includes(mime)) run.mimeTypes.push(mime);
    runs.set(c.runId, run);
  }
  const indexes = chunks.map((c) => c.chunkIndex);
  const analysis = analyzeChunkIndexes(indexes);
  return {
    chunkCount: chunks.length,
    totalBytes,
    mimeTypes: [...mimeTypes].sort(),
    runCount: runs.size,
    runs: [...runs.values()].sort((a, b) => a.firstChunkIndex - b.firstChunkIndex),
    chunkIndexes: [...indexes].sort((a, b) => a - b),
    gaps: analysis.gaps,
    duplicates: analysis.duplicates,
    legacyObjectCount,
    unrecognizedObjectCount: unrecognizedCount,
  };
}

export type CaptureFinalizeDecision =
  | { kind: "finalize"; nextStatus: typeof CAPTURED_SESSION_STATUS; summary: CapturedAudioSummary }
  | { kind: "already_captured" }
  | { kind: "incomplete"; missingChunkIndexes: number[]; reason: string }
  | { kind: "rejected"; reason: string };

/** The only path to 'captured'. Finalizes ONLY when every chunk this device persisted is present
 * in storage with the exact recorded byte size, nothing conflicts, and at least one chunk exists.
 * A missing or mismatched upload yields "incomplete" (the client resumes uploading) — never a
 * captured session with silently-missing audio. Its only success status is 'captured': there is
 * no branch here, or anywhere in native capture, that yields 'queued'.
 *
 * Gaps in the server index sequence are recorded in the summary but do not block: an index can be
 * consumed by a chunk that never persisted locally (e.g. device storage failure), and blocking on
 * it would make the session permanently unfinishable. Duplicates DO block — they mean two blobs
 * claim the same position. */
export function decideCaptureFinalize(input: {
  sessionStatus: string;
  manifest: readonly FinalizeManifestEntry[];
  storedChunks: readonly StoredChunk[];
  unrecognizedCount?: number;
}): CaptureFinalizeDecision {
  if (input.sessionStatus === CAPTURED_SESSION_STATUS) return { kind: "already_captured" };
  if (input.sessionStatus !== RECORDING_SESSION_STATUS) {
    return { kind: "rejected", reason: `This assessment is '${input.sessionStatus}', not recording — it cannot be finished here.` };
  }
  for (const entry of input.manifest) {
    const invalid = validateChunkUploadRequest(entry);
    if (invalid) return { kind: "rejected", reason: `Invalid chunk manifest entry: ${invalid}` };
  }
  const manifestIndexes = analyzeChunkIndexes(input.manifest.map((m) => m.chunkIndex));
  if (manifestIndexes.duplicates.length > 0) return { kind: "rejected", reason: "The device reported the same chunk index twice." };

  const native = input.storedChunks.filter((c) => c.runId !== null);
  if (native.length === 0) return { kind: "rejected", reason: "No recorded audio has been uploaded for this assessment." };

  const storedAnalysis = analyzeChunkIndexes(native.map((c) => c.chunkIndex));
  if (storedAnalysis.duplicates.length > 0) {
    return { kind: "rejected", reason: "Stored audio has more than one object at the same chunk index." };
  }

  const missing: number[] = [];
  for (const entry of input.manifest) {
    const stored = native.find((c) => c.chunkIndex === entry.chunkIndex);
    if (!stored || stored.runId !== entry.runId || stored.size !== entry.size) missing.push(entry.chunkIndex);
  }
  if (missing.length > 0) {
    return {
      kind: "incomplete",
      missingChunkIndexes: missing.sort((a, b) => a - b),
      reason: "Some recorded audio has not finished uploading.",
    };
  }

  return {
    kind: "finalize",
    nextStatus: CAPTURED_SESSION_STATUS,
    summary: summarizeStoredChunks(input.storedChunks, input.unrecognizedCount ?? 0),
  };
}

// ─── Access ───────────────────────────────────────────────────────────────────────────────────

export type CaptureAccessDecision = { ok: true } | { ok: false; error: string };

/** Authorization + ownership for every native-capture action. Role must pass BOTH the current
 * assessment-capture permission and the pilot restriction; the resident must be inside the
 * caller's community scope; and, when a session is involved, it must belong to exactly this
 * resident, be a native-capture session, and be in an allowed status. */
export function decideCaptureAccess(input: {
  role: AuthRole | null | undefined;
  residentInScope: boolean;
  residentId: string;
  session?: { residentId: string; status: string; isNativeCapture: boolean } | null;
  allowedStatuses?: readonly string[];
}): CaptureAccessDecision {
  if (!input.role) return { ok: false, error: "You must be signed in." };
  if (!canCaptureResidentAssessment(input.role) || !canUseMobileCapturePilot(input.role)) {
    return { ok: false, error: "You do not have permission to use the mobile capture pilot." };
  }
  if (!input.residentInScope) return { ok: false, error: "Resident not found." };
  if (input.session === undefined) return { ok: true };
  if (input.session === null) return { ok: false, error: "Assessment session not found for this resident." };
  if (input.session.residentId !== input.residentId) return { ok: false, error: "Assessment session not found for this resident." };
  if (!input.session.isNativeCapture) return { ok: false, error: "This assessment was not recorded with the mobile capture pilot." };
  if (input.allowedStatuses && !input.allowedStatuses.includes(input.session.status)) {
    return { ok: false, error: `This assessment is '${assessmentSessionStatusLabel(input.session.status)}' and cannot accept this action.` };
  }
  return { ok: true };
}

// ─── Browser error messaging ──────────────────────────────────────────────────────────────────

/** Maps a getUserMedia/MediaRecorder failure name to a visible, plain-language message. */
export function microphoneErrorMessage(errorName: string | null | undefined): string {
  switch (errorName) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone access was blocked. Allow microphone access for this site in your browser settings, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone was found on this device.";
    case "NotReadableError":
    case "TrackStartError":
      return "The microphone is in use by another app (for example a phone call). Close it and try again.";
    case "SecurityError":
      return "Microphone access requires a secure (https) connection.";
    case "NotSupportedError":
      return "This browser cannot record audio. Use Safari on iPhone or Chrome.";
    default:
      return "The microphone could not be started. Check microphone permission and try again.";
  }
}
