// Assessment Mobile Capture — recording-health model (pure; no DOM, no I/O).
//
// What a web page can and cannot do on iPhone (Safari / WebKit), stated plainly so nothing below
// pretends otherwise:
//   CAN:  keep the screen from auto-locking while visible (Screen Wake Lock, Safari 16.4+);
//         persist every blob the recorder produces before any network use (IndexedDB);
//         observe the signals WebKit does expose — visibilitychange, MediaStreamTrack
//         ended/mute/unmute, MediaRecorder stop/error/state — and react immediately;
//         start a NEW recorder run into the same assessment after an interruption.
//   CANNOT: keep capturing while the page is hidden (screen locked by the user, Safari or the app
//         backgrounded, another app in front) — iOS suspends the page; keep the microphone
//         through a phone call, Siri, or another app that takes the audio session; prevent the
//         user (or iOS) from locking the screen; know WHY capture stopped when the browser fires
//         no distinguishing signal.
// So the design is: prevent what's preventable (Wake Lock), preserve every byte (IndexedDB),
// detect what isn't (aggressively — any hidden period while recording ends the run, because
// continuity across it can never be proven), tell the assessor, and resume into the same
// assessment as a new, honestly-recorded run.

// ─── Phases ───────────────────────────────────────────────────────────────────────────────────

export type RecordingPhase =
  | "ready" // nothing recorded on this page yet
  | "resuming" // acquiring the microphone / starting a recorder run (first start or after a stop)
  | "recording" // microphone is healthy and producing audio — the ONLY phase the timer runs in
  | "paused" // intentionally paused by the assessor
  | "interrupted" // capture stopped without the assessor asking; needs an explicit Resume
  | "finishing" // recorder stopped; uploading and verifying
  | "captured" // server confirmed: audio durably stored (terminal)
  | "error"; // an action failed (e.g. Finish could not be confirmed); audio is safe; retry possible

export type RecordingEvent =
  | { type: "START_REQUESTED" }
  | { type: "RECORDER_STARTED" }
  | { type: "START_FAILED"; hasPriorAudio: boolean }
  | { type: "PAUSE" }
  | { type: "RESUMED_SAME_RUN" }
  | { type: "INTERRUPTED" }
  | { type: "FINISH_REQUESTED" }
  | { type: "FINISH_CANCELLED" }
  | { type: "FINISH_SUCCEEDED" }
  | { type: "FINISH_FAILED" }
  | { type: "LOADED_WITH_PRIOR_AUDIO" };

/** The complete state machine. Any event not listed for a phase is ignored (returns the same
 * phase) — e.g. a late 'track ended' after Finish began can never drag the UI back. */
export function transitionRecordingPhase(phase: RecordingPhase, event: RecordingEvent): RecordingPhase {
  switch (event.type) {
    case "LOADED_WITH_PRIOR_AUDIO":
      return phase === "ready" ? "interrupted" : phase;
    case "START_REQUESTED":
      return phase === "ready" || phase === "paused" || phase === "interrupted" || phase === "error" ? "resuming" : phase;
    case "RECORDER_STARTED":
      return phase === "resuming" ? "recording" : phase;
    case "RESUMED_SAME_RUN":
      return phase === "paused" ? "recording" : phase;
    case "START_FAILED":
      // Nothing recorded yet -> back to ready; otherwise the assessment is still interrupted.
      return phase === "resuming" ? (event.hasPriorAudio ? "interrupted" : "ready") : phase;
    case "PAUSE":
      return phase === "recording" ? "paused" : phase;
    case "INTERRUPTED":
      return phase === "recording" || phase === "paused" || phase === "resuming" ? "interrupted" : phase;
    case "FINISH_REQUESTED":
      return phase === "recording" || phase === "paused" || phase === "interrupted" || phase === "error" ? "finishing" : phase;
    case "FINISH_CANCELLED":
      return phase === "finishing" ? "paused" : phase;
    case "FINISH_SUCCEEDED":
      return phase === "finishing" ? "captured" : phase;
    case "FINISH_FAILED":
      return phase === "finishing" ? "error" : phase;
  }
}

/** The elapsed-time clock advances only while the microphone is healthy and recording. */
export function timerShouldRun(phase: RecordingPhase): boolean {
  return phase === "recording";
}

/** Phases in which a newly-observed health failure is an interruption to act on. */
export function isCaptureActive(phase: RecordingPhase): boolean {
  return phase === "recording" || phase === "paused";
}

/** Every blob the recorder emits is kept — including the final one delivered while an
 * interruption or Finish is stopping the recorder. Phase is deliberately NOT an input. */
export function shouldPersistRecordedBlob(input: { sessionId: string | null; size: number }): boolean {
  return Boolean(input.sessionId) && input.size > 0;
}

// ─── Screen Wake Lock ─────────────────────────────────────────────────────────────────────────

export type WakeLockStatus = "unsupported" | "inactive" | "active" | "failed";
export type WakeLockAction = "acquire" | "release" | "none";

/** Held exactly while recording with the page visible; released on intentional pause, any
 * interruption, finishing, and when hidden (the browser releases it then anyway). Re-acquired when
 * recording resumes or if the system dropped it while still recording and visible. */
export function decideWakeLockAction(input: { phase: RecordingPhase; visible: boolean; held: boolean; supported: boolean }): WakeLockAction {
  if (!input.supported) return "none";
  const want = input.phase === "recording" && input.visible;
  if (want && !input.held) return "acquire";
  if (!want && input.held) return "release";
  return "none";
}

export interface WakeLockGuidance {
  tone: "protected" | "warning" | "neutral";
  title: string;
  body: string;
}

export function wakeLockGuidance(input: { status: WakeLockStatus; phase: RecordingPhase }): WakeLockGuidance {
  if (input.status === "unsupported" || input.status === "failed") {
    return {
      tone: "warning",
      title: "Keep this screen awake",
      body:
        "Automatic screen protection isn't available on this device. Set Auto-Lock to Never (Settings › Display & Brightness) " +
        "or tap the screen regularly, and stay in Serve while recording.",
    };
  }
  if (input.status === "active" && input.phase === "recording") {
    return {
      tone: "protected",
      title: "Recording protected",
      body:
        "Serve will keep the screen awake while recording. If an iPhone interruption pauses recording, everything already " +
        "captured stays safe and Serve will prompt you to resume.",
    };
  }
  return {
    tone: "neutral",
    title: "Screen will stay awake while recording",
    body: "Stay in Serve while recording — a call, locking the phone, or switching apps will pause it, and Serve will prompt you to resume.",
  };
}

// ─── Interruption detection ───────────────────────────────────────────────────────────────────

/** Why a recorder run ended. Only signals the browser actually distinguishes are named;
 * "unknown" is used when it doesn't — a reason is never guessed. */
export const RUN_END_REASONS = [
  "stopped_for_finish", // the assessor tapped Finish (intentional)
  "page_hidden", // page hidden while recording (lock, app switch, call screen, Safari backgrounded)
  "track_ended", // the microphone track ended (taken away / device disconnected)
  "track_muted", // the microphone track was muted by the system (typically a call or another app)
  "recorder_error", // MediaRecorder raised an error
  "recorder_stopped_unexpectedly", // MediaRecorder became inactive without being asked
  "page_closed_or_reloaded", // a run was still open when this page was loaded again
  "unknown",
] as const;
export type RunEndReason = (typeof RUN_END_REASONS)[number];

export function isInterruptionReason(reason: RunEndReason | null): boolean {
  return reason !== null && reason !== "stopped_for_finish";
}

export function interruptionMessage(reason: RunEndReason): string {
  const tail = "Everything already recorded is saved. Tap Resume recording to continue this assessment.";
  switch (reason) {
    case "page_hidden":
      return `Recording paused because the screen locked or you left Serve. ${tail}`;
    case "track_muted":
      return `Recording paused because iPhone gave the microphone to something else (often a phone call). ${tail}`;
    case "track_ended":
      return `Recording stopped because the microphone was disconnected or taken by another app. ${tail}`;
    case "recorder_error":
    case "recorder_stopped_unexpectedly":
      return `Recording stopped unexpectedly. ${tail}`;
    case "page_closed_or_reloaded":
      return `This assessment was interrupted when the page closed or reloaded. ${tail}`;
    default:
      return `Recording stopped. ${tail}`;
  }
}

export interface CaptureHealthSnapshot {
  recorderState: "inactive" | "recording" | "paused" | null;
  trackReadyState: "live" | "ended" | null;
  trackMuted: boolean;
}

/** Can the recorder/track be proven healthy right now? Returns the failure reason, or null when
 * healthy. Used whenever continuity has to be re-established (resume, return to foreground). */
export function classifyCaptureHealth(s: CaptureHealthSnapshot, expected: "recording" | "paused"): RunEndReason | null {
  if (s.trackReadyState !== "live") return "track_ended";
  if (s.trackMuted) return "track_muted";
  if (s.recorderState === null || s.recorderState === "inactive") return "recorder_stopped_unexpectedly";
  if (s.recorderState !== expected) return "unknown";
  return null;
}

export type ResumePlan = "resume_same_run" | "new_run_reuse_stream" | "new_run_new_stream";

/** Resume as little as necessary: continue the same recorder if it's genuinely paused and the
 * track is healthy; otherwise start a new run, re-requesting the microphone only if the existing
 * track can't be reused. */
export function decideResumePlan(s: CaptureHealthSnapshot): ResumePlan {
  const trackUsable = s.trackReadyState === "live" && !s.trackMuted;
  if (trackUsable && s.recorderState === "paused") return "resume_same_run";
  return trackUsable ? "new_run_reuse_stream" : "new_run_new_stream";
}

/** Starting/resuming never creates a second assessment: an existing session is always reused. */
export function decideSessionForStart(hasSession: boolean): "reuse_session" | "create_or_resume_session" {
  return hasSession ? "reuse_session" : "create_or_resume_session";
}

/** Elapsed seconds to credit when a run segment ends. For a hidden page, capture is presumed to
 * have stopped when the page was hidden, not when the assessor came back. */
export function creditedSegmentSeconds(segmentStartMs: number | null, endMs: number): number {
  if (segmentStartMs === null || endMs <= segmentStartMs) return 0;
  return (endMs - segmentStartMs) / 1000;
}

// ─── Run log (interruption metadata) ──────────────────────────────────────────────────────────

export interface RunLogEntry {
  runId: string;
  startedAt: number;
  endedAt: number | null;
  endReason: RunEndReason | null;
}

export function openRun(log: readonly RunLogEntry[], runId: string, startedAt: number): RunLogEntry[] {
  if (log.some((r) => r.runId === runId)) throw new Error("Run id already used for this assessment.");
  return [...log, { runId, startedAt, endedAt: null, endReason: null }];
}

/** Closes the open run (if any). An already-closed run keeps its first recorded reason. */
export function closeOpenRun(log: readonly RunLogEntry[], endedAt: number, reason: RunEndReason): RunLogEntry[] {
  return log.map((r) => (r.endedAt === null ? { ...r, endedAt: Math.max(endedAt, r.startedAt), endReason: reason } : r));
}

/** On page load, any run still open was cut off by the page closing or reloading — the one
 * thing that IS knowable. Its end time is the last moment this device has evidence of (its
 * latest persisted chunk), never "now". */
export function closeRunsOpenAtLoad(log: readonly RunLogEntry[], lastChunkAtByRun: ReadonlyMap<string, number>): RunLogEntry[] {
  return log.map((r) =>
    r.endedAt === null ? { ...r, endedAt: Math.max(lastChunkAtByRun.get(r.runId) ?? r.startedAt, r.startedAt), endReason: "page_closed_or_reloaded" } : r
  );
}

export interface ContinuitySummary {
  continuity: "continuous" | "interrupted";
  runCount: number;
  interruptionCount: number;
  interruptions: { runId: string; reason: RunEndReason; at: number }[];
  gapsBetweenRunsMs: number[];
}

/** `storageRunCount` covers runs this device never logged (e.g. recorded on another device or
 * before local data was cleared): more stored runs than logged runs is itself evidence the
 * recording was not one continuous capture, with the reason unknown. */
export function summarizeContinuity(log: readonly RunLogEntry[], storageRunCount = 0): ContinuitySummary {
  const sorted = [...log].sort((a, b) => a.startedAt - b.startedAt);
  const interruptions = sorted
    .filter((r) => isInterruptionReason(r.endReason))
    .map((r) => ({ runId: r.runId, reason: r.endReason as RunEndReason, at: r.endedAt ?? r.startedAt }));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].endedAt;
    if (prevEnd !== null) gaps.push(Math.max(0, sorted[i].startedAt - prevEnd));
  }
  const unexplainedRuns = Math.max(0, storageRunCount - sorted.length);
  const interruptionCount = interruptions.length + unexplainedRuns;
  const runCount = Math.max(sorted.length, storageRunCount);
  return {
    continuity: interruptionCount === 0 && runCount <= 1 ? "continuous" : "interrupted",
    runCount,
    interruptionCount,
    interruptions,
    gapsBetweenRunsMs: gaps,
  };
}

const MAX_RUN_LOG_ENTRIES = 500;
const RUN_ID_RE = /^[a-z0-9]{8,32}$/;

/** Server-side validation of a client-reported run log (it's untrusted input). Malformed entries
 * are dropped; an unrecognized reason is recorded as "unknown", never as a guessed one. */
export function sanitizeRunLog(input: unknown): RunLogEntry[] {
  if (!Array.isArray(input)) return [];
  const out: RunLogEntry[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, MAX_RUN_LOG_ENTRIES)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.runId !== "string" || !RUN_ID_RE.test(r.runId) || seen.has(r.runId)) continue;
    if (typeof r.startedAt !== "number" || !Number.isFinite(r.startedAt)) continue;
    const endedAt = typeof r.endedAt === "number" && Number.isFinite(r.endedAt) && r.endedAt >= r.startedAt ? r.endedAt : null;
    const endReason =
      r.endReason === null || r.endReason === undefined
        ? null
        : (RUN_END_REASONS as readonly string[]).includes(r.endReason as string)
          ? (r.endReason as RunEndReason)
          : "unknown";
    seen.add(r.runId);
    out.push({ runId: r.runId, startedAt: r.startedAt, endedAt, endReason: endedAt === null ? null : endReason });
  }
  return out;
}

/** Local copies are deleted only after the server has confirmed 'captured'. */
export function shouldClearLocalCaptureData(finishResult: { status?: string } | { error: string }): boolean {
  return "status" in finishResult && finishResult.status === "captured";
}
