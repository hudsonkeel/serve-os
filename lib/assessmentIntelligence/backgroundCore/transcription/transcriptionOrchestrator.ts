// Captured assessment audio → AWS Transcribe → durable transcript → 'queued' (no I/O of its own:
// every effect goes through injected dependencies, so each lifecycle case is testable without
// AWS or a database).
//
// Invariants:
//   - The AWS PHI gate is decided BEFORE anything is claimed or any AWS client is constructed.
//   - One worker at a time per session (a lease token in processing_claimed_at, status unchanged).
//   - Each run's job name/keys are persisted BEFORE the AWS call that uses them; a resumed
//     invocation looks the job up by that name — never starts a duplicate.
//   - No long polling: one invocation polls for at most `pollBudgetMs`, then returns "running";
//     the next dispatch resumes from persisted state.
//   - The session leaves 'captured' for 'queued' ONLY after the complete transcript is durably in
//     intake_sources.transcript_text. A failure ends at 'failed' (with the audio intact) — never
//     an empty transcript, never an empty draft.
//   - Canonical audio in Supabase is only ever read. AWS staging objects and jobs are cleaned up
//     idempotently after persistence (or failure); a cleanup error never affects the transcript.

import type { StoredChunk } from "../../../assessmentCapture/captureLogic.ts";
import type { AwsAssessmentAuthorization } from "../../phiGovernance.ts";
import { planAudioRuns, reconstructRun } from "./audioRuns.ts";
import { combineRunTranscripts, hasRecognizedSpeech, parseTranscribeOutput } from "./transcriptFormat.ts";
import {
  decideTranscriptionStep,
  initialTranscriptionState,
  jobNameFor,
  parseTranscriptionState,
  stagingKeysFor,
  withCleanupItem,
  withRun,
  type CleanupItem,
  type TranscriptionState,
} from "./transcriptionState.ts";

// ─── Dependency contracts ─────────────────────────────────────────────────────────────────────

export interface TranscriptionSessionRow {
  id: string;
  status: string;
  isSyntheticTest: boolean;
}

export interface NativeAudioSourceRow {
  id: string;
  transcriptText: string | null;
  payload: Record<string, unknown> | null;
  metadata: unknown;
}

export interface TranscriptionStore {
  getSession(sessionId: string): Promise<TranscriptionSessionRow | null>;
  /** Conditional: only a 'captured' session whose lease is free or older than staleBeforeIso. */
  claimLease(sessionId: string, tokenIso: string, staleBeforeIso: string): Promise<boolean>;
  /** Clears the lease only if it is still ours. */
  releaseLease(sessionId: string, tokenIso: string): Promise<void>;
  getNativeAudioSource(sessionId: string): Promise<NativeAudioSourceRow | null>;
  saveState(sourceId: string, state: TranscriptionState): Promise<void>;
  /** Conditional on transcript_text still being null. True when this call wrote it. */
  persistTranscript(sourceId: string, text: string): Promise<boolean>;
  /** Conditional 'captured' -> 'queued'. */
  queueForExtraction(sessionId: string): Promise<boolean>;
  /** Conditional 'captured' -> 'failed' with reason. */
  failTranscription(sessionId: string, reason: string): Promise<boolean>;
}

export interface CapturedAudioReader {
  listChunks(sessionId: string): Promise<{ chunks: StoredChunk[]; error?: string }>;
  download(sessionId: string, chunkName: string): Promise<Uint8Array>;
}

export type TranscribeJobStatus = "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "NOT_FOUND";

export interface TranscriptionBackend {
  putStagingObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** "already_exists" when a job with this name exists (adopted, never duplicated). */
  startJob(input: { jobName: string; inputKey: string; outputKey: string; mediaFormat: string }): Promise<"started" | "already_exists">;
  getJob(jobName: string): Promise<{ status: TranscribeJobStatus; failureReason?: string }>;
  readOutput(outputKey: string): Promise<unknown>;
  /** Idempotent: deleting something already gone succeeds. */
  deleteStagingObject(key: string): Promise<void>;
  deleteJob(jobName: string): Promise<void>;
}

export interface TranscriptionDeps {
  store: TranscriptionStore;
  audio: CapturedAudioReader;
  /** Lazy, so a gate-blocked or not-eligible session never constructs an AWS client. */
  backend: () => TranscriptionBackend;
  authorize: (session: { isSyntheticTest: boolean }) => AwsAssessmentAuthorization;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pollBudgetMs: number;
  pollIntervalMs: number;
  leaseMs: number;
}

export type TranscriptionOutcome =
  | { outcome: "not_eligible"; reason: string }
  | { outcome: "blocked"; reason: string }
  | { outcome: "busy" }
  | { outcome: "running"; reason?: string }
  | { outcome: "queued" }
  | { outcome: "failed"; reason: string };

export const DEFAULT_TRANSCRIPTION_TIMINGS = {
  pollBudgetMs: 4 * 60 * 1000,
  pollIntervalMs: 15 * 1000,
  // Longer than a Netlify Background Function's 15-minute budget, so a live worker's lease can
  // never be taken over; a worker that died frees the session after this window.
  leaseMs: 16 * 60 * 1000,
};

const MAX_CONSECUTIVE_TICK_ERRORS = 3;

function safeError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw.replace(/\s+/g, " ").slice(0, 300);
}

/** Gap before each run (after the first), from the capture client's run log in source_payload
 * when both ends are recorded; otherwise null ("not known"). Never estimated. */
export function gapsFromCaptureRunLog(payload: Record<string, unknown> | null, runIdsInOrder: readonly string[]): (number | null)[] {
  const log = Array.isArray(payload?.run_log) ? (payload!.run_log as { run_id?: unknown; started_at?: unknown; ended_at?: unknown }[]) : [];
  const byId = new Map(log.filter((r) => typeof r.run_id === "string").map((r) => [r.run_id as string, r]));
  const gaps: (number | null)[] = [];
  for (let i = 1; i < runIdsInOrder.length; i++) {
    const prevEnd = byId.get(runIdsInOrder[i - 1])?.ended_at;
    const curStart = byId.get(runIdsInOrder[i])?.started_at;
    const a = typeof prevEnd === "string" ? Date.parse(prevEnd) : NaN;
    const b = typeof curStart === "string" ? Date.parse(curStart) : NaN;
    gaps.push(Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null);
  }
  return gaps;
}

/** Cleanup items safe to delete now: everything, except artifacts of a run attempt that is
 * still being transcribed in an active (running) transcription. */
export function deletableCleanupItems(state: TranscriptionState): CleanupItem[] {
  return state.cleanup.items.filter((item) => {
    if (item.done) return false;
    if (state.status !== "running") return true;
    const run = state.runs.find((r) => r.runId === item.runId);
    const active = run && run.attempt === item.attempt && (run.state === "starting" || run.state === "started" || run.state === "planned");
    return !active;
  });
}

/** Idempotent, best-effort cleanup of temporary AWS artifacts. Never throws; never touches the
 * canonical Supabase audio or the transcript. */
export async function runCleanup(deps: Pick<TranscriptionDeps, "backend" | "store" | "now">, sourceId: string, state: TranscriptionState): Promise<TranscriptionState> {
  const targets = deletableCleanupItems(state);
  if (targets.length === 0) {
    const status = state.cleanup.items.some((i) => !i.done) ? state.cleanup.status : state.cleanup.items.length ? "done" : state.cleanup.status;
    return status === state.cleanup.status ? state : { ...state, cleanup: { ...state.cleanup, status } };
  }
  let backend: TranscriptionBackend;
  try {
    backend = deps.backend();
  } catch (err) {
    const next = { ...state, cleanup: { ...state.cleanup, status: "pending" as const, attempts: state.cleanup.attempts + 1, lastError: safeError(err) } };
    await deps.store.saveState(sourceId, next).catch(() => {});
    return next;
  }
  let lastError: string | null = null;
  const doneJobs = new Set<string>();
  for (const item of targets) {
    try {
      await backend.deleteStagingObject(item.inputKey);
      await backend.deleteStagingObject(item.outputKey);
      await backend.deleteJob(item.jobName);
      doneJobs.add(item.jobName);
    } catch (err) {
      lastError = safeError(err);
    }
  }
  const items = state.cleanup.items.map((i) => (doneJobs.has(i.jobName) ? { ...i, done: true } : i));
  const allDone = items.every((i) => i.done);
  const next: TranscriptionState = {
    ...state,
    updatedAt: new Date(deps.now()).toISOString(),
    cleanup: { status: allDone ? "done" : "pending", items, attempts: state.cleanup.attempts + 1, lastError: allDone ? null : lastError },
  };
  await deps.store.saveState(sourceId, next).catch(() => {});
  return next;
}

// ─── The step runner ──────────────────────────────────────────────────────────────────────────

export async function advanceTranscription(deps: TranscriptionDeps, sessionId: string): Promise<TranscriptionOutcome> {
  const session = await deps.store.getSession(sessionId);
  if (!session) return { outcome: "not_eligible", reason: "Assessment session not found." };
  if (session.status !== "captured") return { outcome: "not_eligible", reason: `Session is '${session.status}', not 'captured'.` };

  const auth = deps.authorize({ isSyntheticTest: session.isSyntheticTest });
  if (!auth.allowed) return { outcome: "blocked", reason: auth.reason };

  const token = new Date(deps.now()).toISOString();
  const staleBefore = new Date(deps.now() - deps.leaseMs).toISOString();
  if (!(await deps.store.claimLease(sessionId, token, staleBefore))) return { outcome: "busy" };

  const iso = () => new Date(deps.now()).toISOString();
  let sourceId: string | null = null;
  let state: TranscriptionState | null = null;

  const save = async (next: TranscriptionState) => {
    state = { ...next, consecutiveErrors: 0 };
    await deps.store.saveState(sourceId!, state);
  };

  const queue = async (): Promise<TranscriptionOutcome> => {
    if (await deps.store.queueForExtraction(sessionId)) return { outcome: "queued" };
    const after = await deps.store.getSession(sessionId);
    return after && after.status !== "captured" ? { outcome: "queued" } : { outcome: "running", reason: "Could not move the session to queued; will retry." };
  };

  const fail = async (reason: string): Promise<TranscriptionOutcome> => {
    if (state && sourceId) {
      const failed: TranscriptionState = {
        ...state,
        status: "failed",
        failureReason: reason,
        updatedAt: iso(),
        cleanup: { ...state.cleanup, status: state.cleanup.items.some((i) => !i.done) ? "pending" : state.cleanup.status },
      };
      await save(failed);
      state = await runCleanup(deps, sourceId, failed);
    }
    await deps.store.failTranscription(sessionId, reason);
    return { outcome: "failed", reason };
  };

  try {
    const source = await deps.store.getNativeAudioSource(sessionId);
    if (!source) return await fail("Transcription: no captured audio source was found for this assessment.");
    sourceId = source.id;

    // Transcript already durable (e.g. a previous invocation died after persisting): just queue.
    if (source.transcriptText !== null && source.transcriptText.trim().length > 0) return await queue();

    const parsed = parseTranscriptionState(source.metadata);
    if (parsed === "unreadable") return await fail("Transcription: stored transcription state is unreadable.");
    state = parsed;

    if (!state) {
      const listing = await deps.audio.listChunks(sessionId);
      if (listing.error) return { outcome: "running", reason: listing.error }; // transient read failure: nothing mutated
      const plan = planAudioRuns(listing.chunks);
      if (!plan.ok) return await fail(`Transcription: ${plan.reason}`);
      await save(initialTranscriptionState(sessionId, plan.runs, iso()));
    }

    const deadline = deps.now() + deps.pollBudgetMs;
    const backend = deps.backend();

    while (true) {
      const current: TranscriptionState = state!;
      const step = decideTranscriptionStep(current);

      if (step.kind === "failed") return await fail(`Transcription: ${step.reason}`);
      if (step.kind === "persisted") return await queue();

      if (step.kind === "start_run" || step.kind === "resume_starting_run") {
        const run = current.runs.find((r) => r.runId === step.runId)!;
        let jobName = run.jobName;
        let inputKey = run.inputKey;
        let outputKey = run.outputKey;
        if (step.kind === "start_run" || !jobName || !inputKey || !outputKey) {
          jobName = jobNameFor(sessionId, run.runId, run.attempt);
          ({ inputKey, outputKey } = stagingKeysFor(sessionId, run.runId, run.attempt, run.extension));
          // Persist the handle (and register its artifacts for cleanup) BEFORE any AWS call.
          let next = withRun(current, run.runId, { state: "starting", jobName, inputKey, outputKey }, iso());
          next = withCleanupItem(next, { runId: run.runId, attempt: run.attempt, jobName, inputKey, outputKey });
          await save(next);
        } else {
          // A previous invocation recorded this handle; adopt the job if it exists.
          const existing = await backend.getJob(jobName);
          if (existing.status !== "NOT_FOUND") {
            await save(withRun(state!, run.runId, { state: "started", startedAt: run.startedAt ?? iso() }, iso()));
            continue;
          }
        }

        const bytes: Uint8Array[] = [];
        for (const name of run.chunkNames) bytes.push(await deps.audio.download(sessionId, name));
        const downloaded = bytes.reduce((n, b) => n + b.length, 0);
        if (downloaded !== run.totalBytes) {
          await save(withRun(state!, run.runId, { state: "failed", failureReason: `Part ${run.order}: stored audio size changed (${downloaded} vs ${run.totalBytes} bytes).` }, iso()));
          continue;
        }
        const media = reconstructRun(run, bytes);
        if (!media.ok) {
          await save(withRun(state!, run.runId, { state: "failed", failureReason: media.reason }, iso()));
          continue;
        }
        await backend.putStagingObject(inputKey!, media.bytes, run.mimeType);
        await backend.startJob({ jobName: jobName!, inputKey: inputKey!, outputKey: outputKey!, mediaFormat: run.mediaFormat });
        await save(withRun(state!, run.runId, { state: "started", startedAt: iso() }, iso()));
        continue;
      }

      if (step.kind === "check_runs") {
        let next = current;
        for (const runId of step.runIds) {
          const run = next.runs.find((r) => r.runId === runId)!;
          const job = await backend.getJob(run.jobName!);
          if (job.status === "QUEUED" || job.status === "IN_PROGRESS") continue;
          if (job.status === "NOT_FOUND") {
            // The job vanished after being recorded as started: restart this attempt's job
            // (same name — nothing exists to duplicate).
            next = withRun(next, runId, { state: "starting" }, iso());
          } else if (job.status === "FAILED") {
            next = withRun(next, runId, { state: "failed", failureReason: `AWS Transcribe could not transcribe part ${run.order}${job.failureReason ? ` (${job.failureReason.slice(0, 200)})` : ""}.` }, iso());
          } else {
            const parsedOutput = parseTranscribeOutput(await backend.readOutput(run.outputKey!));
            next =
              "error" in parsedOutput
                ? withRun(next, runId, { state: "failed", failureReason: `Part ${run.order}: ${parsedOutput.error}` }, iso())
                : withRun(next, runId, { state: "completed", completedAt: iso(), result: parsedOutput }, iso());
          }
        }
        if (next !== current) await save(next);
        const after = decideTranscriptionStep(state!);
        if (after.kind === "check_runs") {
          if (deps.now() + deps.pollIntervalMs > deadline) return { outcome: "running" };
          await deps.sleep(deps.pollIntervalMs);
        }
        continue;
      }

      // step.kind === "combine": every run completed.
      const ordered = [...current.runs].sort((a, b) => a.order - b.order);
      const runsForText = ordered.map((r) => ({ order: r.order, transcript: r.result!, internalGapCount: r.internalGapCount }));
      if (!hasRecognizedSpeech(runsForText)) return await fail("Transcription: no speech was recognized in the recording, so there is nothing to assess.");
      const text = combineRunTranscripts(runsForText, gapsFromCaptureRunLog(source.payload, ordered.map((r) => r.runId)));

      const wrote = await deps.store.persistTranscript(source.id, text);
      if (!wrote) {
        const reread = await deps.store.getNativeAudioSource(sessionId);
        if (!reread?.transcriptText) return { outcome: "running", reason: "Transcript could not be saved yet; will retry." };
      }
      const persisted: TranscriptionState = {
        ...current,
        status: "persisted",
        persistedAt: iso(),
        updatedAt: iso(),
        cleanup: { ...current.cleanup, status: current.cleanup.items.some((i) => !i.done) ? "pending" : "done" },
      };
      await save(persisted);
      state = await runCleanup(deps, source.id, persisted);
      return await queue();
    }
  } catch (err) {
    // Unexpected/transient (network, throttling, a dying dependency): leave the persisted state for
    // the next dispatch; after repeated consecutive failures, fail visibly instead of looping.
    const reason = safeError(err);
    const s: TranscriptionState | null = state;
    if (s && sourceId) {
      const errors = (s.consecutiveErrors ?? 0) + 1;
      if (errors >= MAX_CONSECUTIVE_TICK_ERRORS) return await fail(`Transcription: repeated errors (${reason}).`).catch(() => ({ outcome: "failed" as const, reason }));
      await deps.store.saveState(sourceId, { ...s, consecutiveErrors: errors, updatedAt: iso() }).catch(() => {});
    }
    return { outcome: "running", reason };
  } finally {
    await deps.store.releaseLease(sessionId, token).catch(() => {});
  }
}

/** Retry cleanup for a session whose transcription is finished (persisted or failed) but whose
 * temporary AWS artifacts weren't all removed. Safe to call at any time, any number of times. */
export async function retryTranscriptionCleanup(deps: Pick<TranscriptionDeps, "store" | "backend" | "now">, sessionId: string): Promise<"cleaned" | "nothing_to_do" | "pending"> {
  const source = await deps.store.getNativeAudioSource(sessionId);
  const state = source ? parseTranscriptionState(source.metadata) : null;
  if (!source || !state || state === "unreadable" || state.cleanup.status !== "pending") return "nothing_to_do";
  const next = await runCleanup(deps, source.id, state);
  return next.cleanup.status === "done" ? "cleaned" : "pending";
}
