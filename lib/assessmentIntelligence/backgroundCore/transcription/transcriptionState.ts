// Durable transcription state (pure). Stored in the EXISTING intake_sources columns of the
// session's live_audio_stream source:
//   transcription_provider          = "aws-transcribe"
//   transcription_job_id            = the batch id of this transcription (one batch per session)
//   transcription_provider_metadata = TranscriptionState below (per-run jobs, results, cleanup)
// No session-level stage machine is added: the session stays 'captured' throughout
// transcription and moves to 'queued' only after the complete transcript is durably persisted
// in intake_sources.transcript_text.
//
// Every AWS name is DETERMINISTIC from (session, run, attempt) and recorded BEFORE the AWS call
// that uses it, so an invocation that dies at any point is resumed by the next one looking up
// the same job — never by starting a duplicate.

import type { AudioRunPlan } from "./audioRuns.ts";
import type { ParsedRunTranscript } from "./transcriptFormat.ts";

export const TRANSCRIPTION_STATE_VERSION = 1;
export const TRANSCRIPTION_PROVIDER_ID = "aws-transcribe";
export const MAX_RUN_ATTEMPTS = 3;
export const STAGING_PREFIX = "transcribe-staging";

export type RunJobState = "planned" | "starting" | "started" | "completed" | "failed";

export interface RunTranscriptionState {
  runId: string;
  order: number;
  chunkNames: string[];
  chunkIndexes: number[];
  mimeType: string;
  extension: string;
  mediaFormat: string;
  totalBytes: number;
  internalGapCount: number;
  attempt: number;
  jobName: string | null;
  inputKey: string | null;
  outputKey: string | null;
  state: RunJobState;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  result: ParsedRunTranscript | null;
}

export interface CleanupItem {
  runId: string;
  attempt: number;
  jobName: string;
  inputKey: string;
  outputKey: string;
  done: boolean;
}

export interface TranscriptionState {
  version: number;
  provider: typeof TRANSCRIPTION_PROVIDER_ID;
  batchId: string;
  status: "running" | "failed" | "persisted";
  createdAt: string;
  updatedAt: string;
  runs: RunTranscriptionState[];
  cleanup: { status: "none" | "pending" | "done"; items: CleanupItem[]; attempts: number; lastError: string | null };
  persistedAt: string | null;
  failureReason: string | null;
  /** Unexpected errors in consecutive invocations; reset by any durable progress. */
  consecutiveErrors?: number;
}

/** Prefix of every AWS Transcribe job name. MUST match the IAM resource scope of
 * ServeAssessmentAWSPipelinePolicy (transcribe:GetTranscriptionJob / DeleteTranscriptionJob are
 * granted on transcription-job/serve-assessment-*) — changing it breaks status checks and cleanup. */
export const TRANSCRIBE_JOB_NAME_PREFIX = "serve-assessment-";

export function batchIdFor(sessionId: string): string {
  return `${TRANSCRIBE_JOB_NAME_PREFIX}${sessionId}`;
}

/** AWS job names allow [0-9a-zA-Z._-], max 200 chars; unique per account+region. Format:
 * serve-assessment-{session}-{run}-a{attempt} (~92 chars, so the 200 limit never truncates). */
export function jobNameFor(sessionId: string, runId: string, attempt: number): string {
  return `${TRANSCRIBE_JOB_NAME_PREFIX}${sessionId}-${runId}-a${attempt}`.slice(0, 200);
}

export function stagingKeysFor(sessionId: string, runId: string, attempt: number, extension: string): { inputKey: string; outputKey: string } {
  const base = `${STAGING_PREFIX}/${sessionId}/${runId}/a${attempt}`;
  return { inputKey: `${base}/input.${extension}`, outputKey: `${base}/output.json` };
}

export function initialTranscriptionState(sessionId: string, runs: readonly AudioRunPlan[], nowIso: string): TranscriptionState {
  return {
    version: TRANSCRIPTION_STATE_VERSION,
    provider: TRANSCRIPTION_PROVIDER_ID,
    batchId: batchIdFor(sessionId),
    status: "running",
    createdAt: nowIso,
    updatedAt: nowIso,
    runs: runs.map((r) => ({
      runId: r.runId,
      order: r.order,
      chunkNames: [...r.chunkNames],
      chunkIndexes: [...r.chunkIndexes],
      mimeType: r.mimeType,
      extension: r.extension,
      mediaFormat: r.mediaFormat,
      totalBytes: r.totalBytes,
      internalGapCount: r.internalGaps.length,
      attempt: 1,
      jobName: null,
      inputKey: null,
      outputKey: null,
      state: "planned",
      startedAt: null,
      completedAt: null,
      failureReason: null,
      result: null,
    })),
    cleanup: { status: "none", items: [], attempts: 0, lastError: null },
    persistedAt: null,
    failureReason: null,
  };
}

/** Tolerant reader for the stored JSON; anything unrecognized is treated as "no state" only
 * when it is genuinely absent — an unreadable version fails closed in the orchestrator. */
export function parseTranscriptionState(raw: unknown): TranscriptionState | null | "unreadable" {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return "unreadable";
  const s = raw as Partial<TranscriptionState>;
  if (s.version !== TRANSCRIPTION_STATE_VERSION || s.provider !== TRANSCRIPTION_PROVIDER_ID || !Array.isArray(s.runs)) return "unreadable";
  return s as TranscriptionState;
}

export type TranscriptionStep =
  | { kind: "start_run"; runId: string }
  | { kind: "resume_starting_run"; runId: string }
  | { kind: "check_runs"; runIds: string[] }
  | { kind: "combine" }
  | { kind: "failed"; reason: string }
  | { kind: "persisted" };

/** What the next durable step is. Starts runs one at a time in order (each start is persisted
 * before the next), checks every started run, combines only when ALL runs completed. Any failed
 * run fails the transcription (completed runs keep their results for a retry). */
export function decideTranscriptionStep(state: TranscriptionState): TranscriptionStep {
  if (state.status === "persisted") return { kind: "persisted" };
  const failed = state.runs.find((r) => r.state === "failed");
  if (failed) return { kind: "failed", reason: failed.failureReason ?? `Transcription failed for part ${failed.order}.` };
  const starting = state.runs.find((r) => r.state === "starting");
  if (starting) return { kind: "resume_starting_run", runId: starting.runId };
  const planned = state.runs.find((r) => r.state === "planned");
  if (planned) return { kind: "start_run", runId: planned.runId };
  const started = state.runs.filter((r) => r.state === "started").map((r) => r.runId);
  if (started.length > 0) return { kind: "check_runs", runIds: started };
  return { kind: "combine" };
}

export function withRun(state: TranscriptionState, runId: string, patch: Partial<RunTranscriptionState>, nowIso: string): TranscriptionState {
  return { ...state, updatedAt: nowIso, runs: state.runs.map((r) => (r.runId === runId ? { ...r, ...patch } : r)) };
}

/** Registers a run attempt's AWS artifacts for cleanup at the moment they are named — so even
 * an attempt that later fails, or a worker that dies mid-start, leaves nothing untracked. */
export function withCleanupItem(state: TranscriptionState, item: Omit<CleanupItem, "done">): TranscriptionState {
  if (state.cleanup.items.some((i) => i.jobName === item.jobName)) return state;
  return { ...state, cleanup: { ...state.cleanup, items: [...state.cleanup.items, { ...item, done: false }] } };
}

/** Operator retry after a transcription failure: failed runs get a NEW attempt (new job name and
 * keys); completed runs are kept and not re-transcribed. Refused once a run has used every attempt. */
export function resetFailedRunsForRetry(state: TranscriptionState, nowIso: string): { ok: true; state: TranscriptionState } | { ok: false; reason: string } {
  const exhausted = state.runs.find((r) => r.state === "failed" && r.attempt >= MAX_RUN_ATTEMPTS);
  if (exhausted) return { ok: false, reason: `Transcription of part ${exhausted.order} failed ${MAX_RUN_ATTEMPTS} times; contact an administrator.` };
  return {
    ok: true,
    state: {
      ...state,
      status: "running",
      failureReason: null,
      updatedAt: nowIso,
      runs: state.runs.map((r) =>
        r.state === "failed"
          ? { ...r, attempt: r.attempt + 1, state: "planned", jobName: null, inputKey: null, outputKey: null, startedAt: null, completedAt: null, failureReason: null, result: null }
          : r
      ),
    },
  };
}

export type TranscriptionDisplayState = "awaiting" | "transcribing" | "failed" | "transcribed";

/** Operator-facing transcription progress for one session (no AWS jargon). */
export function transcriptionDisplayState(input: { state: TranscriptionState | null | "unreadable"; transcriptPersisted: boolean }): TranscriptionDisplayState {
  if (input.transcriptPersisted) return "transcribed";
  if (input.state === null) return "awaiting";
  if (input.state === "unreadable") return "failed";
  if (input.state.status === "failed") return "failed";
  return "transcribing";
}

/** Where an operator Retry of a FAILED session must send it. A recorded-audio assessment whose
 * transcript was never persisted goes back to transcription ('captured'); anything with a
 * durable transcript goes back to extraction ('queued'). An audio-only session is never queued. */
export function decideRetryRoute(input: { hasNativeAudioSource: boolean; transcriptPersisted: boolean }): "transcription" | "extraction" {
  return input.hasNativeAudioSource && !input.transcriptPersisted ? "transcription" : "extraction";
}
