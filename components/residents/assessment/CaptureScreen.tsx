"use client";

// Assessment Mobile Capture — native in-browser assessment recorder (opened by the normal
// Assessment/Reassessment button).
//
// Resilience model (see lib/assessmentCapture/recordingHealth.ts for what iOS/Safari does and
// does not allow a web page to do):
//   PREVENT  — Screen Wake Lock is requested automatically whenever recording is active and the
//              page is visible, released on intentional pause/finish, re-acquired on resume or if
//              the system drops it mid-recording; if unavailable, a clear stronger warning shows.
//   PRESERVE — every MediaRecorder blob (including the final one delivered while an interruption
//              or Finish stops the recorder) is written to IndexedDB before any network use, with
//              runId/chunkIndex/MIME/size/timestamp; chunk indexes only ever increase.
//   DETECT   — page hidden while recording, microphone track ended or muted, MediaRecorder error
//              or unexpected stop all END the current run immediately. A hidden period is always
//              treated as an interruption because continuity across it can never be proven.
//              The timer runs only while the microphone is healthy and recording.
//   ALERT    — a prominent "Recording interrupted" state; the UI never claims to be recording
//              unless a healthy recorder is.
//   RESUME   — "Resume recording" starts a NEW run (new runId) in the SAME assessment, reusing
//              the microphone stream when it's still healthy and re-requesting it only when not.
//   RECORD   — every run's start/end/reason is logged (IndexedDB, then source_payload at Finish),
//              so an interrupted assessment is never presented as one continuous recording.
// Original blobs are preserved exactly — nothing here concatenates or re-encodes audio.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Mic, MicOff, Pause, Play, Square, Loader2, AlertTriangle, CheckCircle2, ShieldCheck, Smartphone } from "lucide-react";
import {
  startOrResumeNativeCapture,
  requestNativeChunkUpload,
  finishNativeCapture,
  type NativeCaptureStartState,
} from "@/lib/actions/nativeAssessmentCapture";
import {
  CHUNK_TIMESLICE_MS,
  deriveNextChunkIndex,
  mimeTypeToExtension,
  microphoneErrorMessage,
  pickRecorderMimeType,
  capturedAssessmentNotice,
} from "@/lib/assessmentCapture/captureLogic";
import {
  classifyCaptureHealth,
  closeOpenRun,
  closeRunsOpenAtLoad,
  creditedSegmentSeconds,
  decideResumePlan,
  decideSessionForStart,
  decideWakeLockAction,
  interruptionMessage,
  isCaptureActive,
  openRun,
  shouldClearLocalCaptureData,
  shouldPersistRecordedBlob,
  summarizeContinuity,
  timerShouldRun,
  transitionRecordingPhase,
  wakeLockGuidance,
  type CaptureHealthSnapshot,
  type RecordingEvent,
  type RecordingPhase,
  type RunEndReason,
  type RunLogEntry,
  type WakeLockStatus,
} from "@/lib/assessmentCapture/recordingHealth";
import {
  addChunk,
  deleteChunksForSession,
  deleteRunsForSession,
  getChunksForSession,
  getRunsForSession,
  saveRun,
  setChunkState,
  type LocalChunkRecord,
} from "@/lib/assessmentCapture/idb";

interface Counts {
  total: number;
  uploaded: number;
  pending: number;
  conflicts: number;
  orphaned: number;
}

const EMPTY_COUNTS: Counts = { total: 0, uploaded: 0, pending: 0, conflicts: 0, orphaned: 0 };
const BACKOFF_START_MS = 2_000;
const BACKOFF_MAX_MS = 30_000;
const MAX_FINISH_VERIFY_ATTEMPTS = 5;
const RECORDER_STOP_TIMEOUT_MS = 5_000;

function countChunks(chunks: readonly LocalChunkRecord[]): Counts {
  return {
    total: chunks.length,
    uploaded: chunks.filter((c) => c.state === "uploaded").length,
    pending: chunks.filter((c) => c.state === "pending").length,
    conflicts: chunks.filter((c) => c.state === "conflict").length,
    orphaned: chunks.filter((c) => c.state === "orphaned").length,
  };
}

const subscribeNoop = () => () => {};

function newRunId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PHASE_LABEL: Record<RecordingPhase, string> = {
  ready: "Ready",
  resuming: "Starting microphone…",
  recording: "Recording",
  paused: "Paused",
  interrupted: "Not recording — interrupted",
  finishing: "Finishing — uploading remaining audio…",
  captured: "Audio captured",
  error: "Not recording",
};

interface CaptureScreenProps {
  residentId: string;
  residentDisplayName: string;
  initialState: NativeCaptureStartState;
}

export function CaptureScreen({ residentId, residentDisplayName, initialState }: CaptureScreenProps) {
  const [phase, setPhaseState] = useState<RecordingPhase>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [interruptionText, setInterruptionText] = useState<string | null>(null);
  const [interruptionCount, setInterruptionCount] = useState(0);
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>("inactive");
  const [done, setDone] = useState<{ summary: string; interrupted: boolean; interruptionCount: number; transcriptionEnabled: boolean } | null>(null);
  const [hasSession, setHasSession] = useState(initialState.kind === "resumable");

  const phaseRef = useRef<RecordingPhase>("ready");
  const sessionIdRef = useRef<string | null>(initialState.kind === "resumable" ? initialState.session.assessmentSessionId : null);
  const nextIndexRef = useRef<number>(initialState.kind === "resumable" ? initialState.session.serverNextChunkIndex : 0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runLogRef = useRef<RunLogEntry[]>([]);
  const intentionalStopsRef = useRef<WeakSet<MediaRecorder>>(new WeakSet());
  const pendingWritesRef = useRef<Set<Promise<void>>>(new Set());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wakeLockBusyRef = useRef(false);
  const elapsedBaseRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  const loopRunningRef = useRef(false);
  const loopKickRef = useRef(false);
  const wakeSleepRef = useRef<(() => void) | null>(null);

  const wakeLockSupported = () => typeof navigator !== "undefined" && "wakeLock" in navigator;
  // Hydration-safe feature detection: the server renders "supported" (neutral copy); the client
  // swaps to the stronger warning immediately if the Wake Lock API isn't there.
  const wakeLockAvailable = useSyncExternalStore(
    subscribeNoop,
    () => "wakeLock" in navigator,
    () => true
  );

  // ─── Wake Lock (automatic) ────────────────────────────────────────────────────────────────

  const syncWakeLock = useCallback(async () => {
    if (wakeLockBusyRef.current) return;
    const action = decideWakeLockAction({
      phase: phaseRef.current,
      visible: typeof document !== "undefined" ? !document.hidden : false,
      held: wakeLockRef.current !== null,
      supported: wakeLockSupported(),
    });
    if (action === "none") return;
    wakeLockBusyRef.current = true;
    try {
      if (action === "release") {
        const sentinel = wakeLockRef.current;
        wakeLockRef.current = null;
        setWakeLockStatus("inactive");
        await sentinel?.release().catch(() => {});
        return;
      }
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        wakeLockRef.current = sentinel;
        setWakeLockStatus("active");
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current !== sentinel) return; // our own intentional release
          // The system dropped it (e.g. page hidden, low power). Re-acquire if still recording
          // and visible; if that fails the status falls to "failed" and the warning shows.
          wakeLockRef.current = null;
          setWakeLockStatus("inactive");
          void syncWakeLockRef.current?.();
        });
      } catch {
        setWakeLockStatus("failed");
      }
    } finally {
      wakeLockBusyRef.current = false;
    }
  }, []);
  const syncWakeLockRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    syncWakeLockRef.current = syncWakeLock;
  }, [syncWakeLock]);

  const dispatch = useCallback(
    (event: RecordingEvent): RecordingPhase => {
      const next = transitionRecordingPhase(phaseRef.current, event);
      phaseRef.current = next;
      setPhaseState(next);
      void syncWakeLock();
      return next;
    },
    [syncWakeLock]
  );

  // ─── Run log ──────────────────────────────────────────────────────────────────────────────

  const updateRunLog = useCallback((fn: (log: readonly RunLogEntry[]) => RunLogEntry[]) => {
    const before = runLogRef.current;
    const after = fn(before);
    runLogRef.current = after;
    setInterruptionCount(summarizeContinuity(after).interruptionCount);
    const sid = sessionIdRef.current;
    if (!sid) return;
    for (const run of after) {
      const prev = before.find((r) => r.runId === run.runId);
      if (!prev || prev.endedAt !== run.endedAt || prev.endReason !== run.endReason) {
        void saveRun(sid, run).catch(() => {});
      }
    }
  }, []);

  // ─── Elapsed time (only while healthy and recording) ──────────────────────────────────────

  const creditSegment = useCallback((endMs: number) => {
    elapsedBaseRef.current += creditedSegmentSeconds(segmentStartRef.current, endMs);
    segmentStartRef.current = null;
    setElapsed(elapsedBaseRef.current);
  }, []);

  // ─── Upload loop (unchanged behavior) ─────────────────────────────────────────────────────

  const refreshCounts = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return EMPTY_COUNTS;
    const next = countChunks(await getChunksForSession(sid));
    setCounts(next);
    return next;
  }, []);

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          wakeSleepRef.current = null;
          resolve();
        }, ms);
        wakeSleepRef.current = () => {
          clearTimeout(timer);
          wakeSleepRef.current = null;
          resolve();
        };
      }),
    []
  );

  const uploadOne = useCallback(
    async (chunk: LocalChunkRecord): Promise<"done" | "retry" | "stop"> => {
      let result: Awaited<ReturnType<typeof requestNativeChunkUpload>>;
      try {
        result = await requestNativeChunkUpload({
          residentId,
          assessmentSessionId: chunk.sessionId,
          chunkIndex: chunk.chunkIndex,
          runId: chunk.runId,
          mimeType: chunk.mimeType,
          size: chunk.size,
        });
      } catch {
        return "retry";
      }
      switch (result.kind) {
        case "already_uploaded":
          await setChunkState(chunk.sessionId, chunk.chunkIndex, "uploaded");
          return "done";
        case "conflict":
          await setChunkState(chunk.sessionId, chunk.chunkIndex, "conflict", result.error);
          setError(`An audio segment could not be saved (${result.error}). Do not discard this device's data; contact an administrator.`);
          return "done";
        case "session_closed":
          await setChunkState(chunk.sessionId, chunk.chunkIndex, "orphaned", result.error);
          return "done";
        case "denied":
          setError(result.error);
          return "stop";
        case "retry":
          setUploadNote(result.error);
          return "retry";
        case "upload": {
          try {
            const response = await fetch(result.signedUrl, {
              method: "PUT",
              headers: { "content-type": chunk.mimeType, "x-upsert": "false", "cache-control": "max-age=3600" },
              body: chunk.blob,
            });
            if (response.ok) {
              await setChunkState(chunk.sessionId, chunk.chunkIndex, "uploaded");
              return "done";
            }
            // 400/409: storage refused because the object already exists (never overwritten).
            // The next request resolves it to already_uploaded or conflict — not a blind retry.
            return response.status === 400 || response.status === 409 ? "done" : "retry";
          } catch {
            return "retry"; // offline / transient
          }
        }
      }
    },
    [residentId]
  );

  const runUploadLoop = useCallback(async () => {
    // A kick while the loop is already running just asks it to re-scan before exiting; it does
    // not cut a backoff sleep short (only the browser's "online" event does that).
    loopKickRef.current = true;
    if (loopRunningRef.current) return;
    loopRunningRef.current = true;
    let backoff = BACKOFF_START_MS;
    try {
      while (loopKickRef.current) {
        loopKickRef.current = false;
        while (true) {
          const sid = sessionIdRef.current;
          if (!sid) break;
          const chunks = await getChunksForSession(sid);
          setCounts(countChunks(chunks));
          const next = chunks.find((c) => c.state === "pending");
          if (!next) {
            setUploadNote(null);
            break;
          }
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            setUploadNote("Offline — audio is safe on this device and will upload when the connection returns.");
            await sleep(backoff);
            continue;
          }
          const outcome = await uploadOne(next);
          if (outcome === "stop") return;
          if (outcome === "retry") {
            setUploadNote((note) => note ?? "Upload interrupted — retrying automatically.");
            await sleep(backoff);
            backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
            continue;
          }
          backoff = BACKOFF_START_MS;
          setUploadNote(null);
        }
      }
    } finally {
      loopRunningRef.current = false;
      await refreshCounts();
    }
  }, [refreshCounts, sleep, uploadOne]);

  // ─── Recorder lifecycle ───────────────────────────────────────────────────────────────────

  const snapshot = useCallback((): CaptureHealthSnapshot => {
    const track = streamRef.current?.getAudioTracks()[0];
    return {
      recorderState: recorderRef.current?.state ?? null,
      trackReadyState: track?.readyState ?? null,
      trackMuted: track?.muted ?? false,
    };
  }, []);

  /** Intentionally stops a recorder and waits (bounded) for its final blob to be persisted. The
   * final dataavailable is persisted by the recorder's own handler regardless of phase. */
  const stopRecorder = useCallback(async (recorder: MediaRecorder | null) => {
    if (recorder && recorder.state !== "inactive") {
      intentionalStopsRef.current.add(recorder);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, RECORDER_STOP_TIMEOUT_MS);
        recorder.addEventListener(
          "stop",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
        try {
          recorder.stop();
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
    }
    await Promise.allSettled([...pendingWritesRef.current]);
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Any unexpected loss of capture health: end the run at `endAtMs`, stop the timer, keep the
   * final blob, alert the assessor. Idempotent — a second signal for the same loss is ignored. */
  const interruptRef = useRef<(reason: RunEndReason, endAtMs?: number) => Promise<void>>(async () => {});
  const interrupt = useCallback(
    async (reason: RunEndReason, endAtMs?: number) => {
      const from = phaseRef.current;
      if (!isCaptureActive(from) && from !== "resuming") return;
      const end = endAtMs ?? Date.now();
      // A run that was already paused stopped capturing when it was paused.
      creditSegment(end);
      const runEnd = from === "paused" && pausedAtRef.current !== null ? pausedAtRef.current : end;
      dispatch({ type: "INTERRUPTED" });
      updateRunLog((log) => closeOpenRun(log, runEnd, reason));
      setNotice(null);
      setInterruptionText(interruptionMessage(reason));
      const recorder = recorderRef.current;
      recorderRef.current = null;
      await stopRecorder(recorder);
      if (reason === "track_ended" || reason === "track_muted") releaseStream();
      void runUploadLoop();
    },
    [creditSegment, dispatch, releaseStream, runUploadLoop, stopRecorder, updateRunLog]
  );
  useEffect(() => {
    interruptRef.current = interrupt;
  }, [interrupt]);

  const beginRun = useCallback(
    (stream: MediaStream) => {
      const chosen = pickRecorderMimeType(typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported?.bind(MediaRecorder) : null);
      const recorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
      const recorderMime = recorder.mimeType || chosen;
      if (recorderMime && !mimeTypeToExtension(recorderMime)) {
        throw new Error(`This browser records audio as "${recorderMime}", which Serve OS does not support yet.`);
      }
      const runId = newRunId();

      recorder.ondataavailable = (event: BlobEvent) => {
        const sid = sessionIdRef.current;
        if (!event.data || !shouldPersistRecordedBlob({ sessionId: sid, size: event.data.size })) return;
        const chunkIndex = nextIndexRef.current++;
        const mimeType = event.data.type || recorder.mimeType || chosen;
        if (!mimeTypeToExtension(mimeType)) {
          setError(`Recorded audio type "${mimeType || "unknown"}" is not supported — this segment was not saved.`);
          return;
        }
        const write = addChunk({ sessionId: sid!, chunkIndex, runId, blob: event.data, mimeType, size: event.data.size, recordedAt: Date.now() })
          .then(() => {
            void refreshCounts();
            void runUploadLoop();
          })
          .catch(() => {
            setError("Warning: this device could not save the last audio segment. Check free storage space.");
          })
          .finally(() => {
            pendingWritesRef.current.delete(write);
          });
        pendingWritesRef.current.add(write);
      };
      recorder.onstop = () => {
        if (!intentionalStopsRef.current.has(recorder)) void interruptRef.current("recorder_stopped_unexpectedly");
      };
      recorder.onerror = () => {
        void interruptRef.current("recorder_error");
      };
      for (const track of stream.getAudioTracks()) {
        track.onended = () => void interruptRef.current("track_ended");
        // iOS mutes (rather than ends) the track when a call or another app takes the audio
        // session. Muted audio is silence, never "recording" — end the run.
        track.onmute = () => void interruptRef.current("track_muted");
        track.onunmute = () => {
          if (phaseRef.current === "interrupted") setNotice("The microphone is available again — tap Resume recording to continue.");
        };
      }

      updateRunLog((log) => openRun(log, runId, Date.now()));
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start(CHUNK_TIMESLICE_MS);
      segmentStartRef.current = Date.now();
      pausedAtRef.current = null;
    },
    [refreshCounts, runUploadLoop, updateRunLog]
  );

  async function handleStart() {
    const hadPriorAudio = hasSession;
    setError(null);
    dispatch({ type: "START_REQUESTED" });

    if (decideSessionForStart(Boolean(sessionIdRef.current)) === "create_or_resume_session") {
      const result = await startOrResumeNativeCapture(residentId).catch(() => ({ error: "Could not reach Serve OS. Check the connection and try again." }));
      if (!("session" in result) || !result.session) {
        setError(result.error ?? "Could not start the assessment.");
        dispatch({ type: "START_FAILED", hasPriorAudio: hadPriorAudio });
        return;
      }
      sessionIdRef.current = result.session.assessmentSessionId;
      nextIndexRef.current = result.session.serverNextChunkIndex;
      setHasSession(true);
    }

    // Reuse the microphone stream when it's still healthy; re-request it only when necessary.
    let stream = streamRef.current;
    if (decideResumePlan({ ...snapshot(), recorderState: null }) === "new_run_new_stream") {
      releaseStream();
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError(microphoneErrorMessage("NotSupportedError"));
        dispatch({ type: "START_FAILED", hasPriorAudio: hadPriorAudio || hasSession });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        setError(microphoneErrorMessage(err instanceof DOMException ? err.name : null));
        dispatch({ type: "START_FAILED", hasPriorAudio: hadPriorAudio || Boolean(sessionIdRef.current) });
        return;
      }
    }

    // Never reuse an index: max(server-derived next index, everything this device holds) + run.
    const local = await getChunksForSession(sessionIdRef.current!);
    nextIndexRef.current = Math.max(nextIndexRef.current, deriveNextChunkIndex([], local.map((c) => c.chunkIndex)));

    try {
      beginRun(stream!);
    } catch (err) {
      releaseStream();
      setError(err instanceof Error ? err.message : microphoneErrorMessage(null));
      dispatch({ type: "START_FAILED", hasPriorAudio: hadPriorAudio || Boolean(sessionIdRef.current) });
      return;
    }
    setInterruptionText(null);
    setNotice(null);
    dispatch({ type: "RECORDER_STARTED" });
    void runUploadLoop();
  }

  function handlePause() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.pause();
    } catch {
      void interrupt("recorder_error");
      return;
    }
    pausedAtRef.current = Date.now();
    creditSegment(pausedAtRef.current);
    dispatch({ type: "PAUSE" });
  }

  async function handleResume() {
    if (phaseRef.current === "paused") {
      const snap = snapshot();
      const health = classifyCaptureHealth(snap, "paused");
      if (health === null && decideResumePlan(snap) === "resume_same_run") {
        try {
          recorderRef.current!.resume();
          segmentStartRef.current = Date.now();
          pausedAtRef.current = null;
          dispatch({ type: "RESUMED_SAME_RUN" });
          return;
        } catch {
          // fall through to a new run
        }
      }
      // The paused run can't continue (e.g. iOS ended the track while paused). It stopped
      // capturing when it was paused; record why it can't resume, then start a new run.
      const recorder = recorderRef.current;
      recorderRef.current = null;
      updateRunLog((log) => closeOpenRun(log, pausedAtRef.current ?? Date.now(), health ?? "unknown"));
      await stopRecorder(recorder);
    }
    await handleStart();
  }

  async function handleFinish() {
    setError(null);
    const now = Date.now();
    if (phaseRef.current === "recording") creditSegment(now);
    const runEnd = phaseRef.current === "paused" && pausedAtRef.current !== null ? pausedAtRef.current : now;
    dispatch({ type: "FINISH_REQUESTED" });
    updateRunLog((log) => closeOpenRun(log, runEnd, "stopped_for_finish"));
    const recorder = recorderRef.current;
    recorderRef.current = null;
    await stopRecorder(recorder);
    releaseStream();

    const sid = sessionIdRef.current;
    if (!sid) {
      setError("Nothing has been recorded yet.");
      dispatch({ type: "FINISH_FAILED" });
      return;
    }

    for (let attempt = 0; attempt < MAX_FINISH_VERIFY_ATTEMPTS; attempt++) {
      // 1. Wait until every locally-persisted chunk has uploaded.
      while (true) {
        if (phaseRef.current !== "finishing") return; // assessor chose to keep recording
        void runUploadLoop();
        const c = await refreshCounts();
        if (c.conflicts > 0) {
          setError("Some audio segments conflict with audio already stored. The assessment cannot be finished — contact an administrator.");
          dispatch({ type: "FINISH_FAILED" });
          return;
        }
        if (c.pending === 0 && !loopRunningRef.current) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (phaseRef.current !== "finishing") return;

      // 2. Ask the server to verify every uploaded chunk and finalize to 'captured'.
      const local = await getChunksForSession(sid);
      const manifest = local
        .filter((c) => c.state === "uploaded")
        .map((c) => ({ chunkIndex: c.chunkIndex, runId: c.runId, mimeType: c.mimeType, size: c.size, recordedAt: c.recordedAt }));
      let result: Awaited<ReturnType<typeof finishNativeCapture>>;
      try {
        result = await finishNativeCapture({ residentId, assessmentSessionId: sid, manifest, runLog: runLogRef.current });
      } catch {
        setError("Could not reach Serve OS to finish. Your audio is safe — check the connection and tap Finish again.");
        dispatch({ type: "FINISH_FAILED" });
        return;
      }
      if ("status" in result) {
        if (shouldClearLocalCaptureData(result)) {
          await deleteChunksForSession(sid).catch(() => {});
          await deleteRunsForSession(sid).catch(() => {});
        }
        setDone({
          summary: `${result.chunkCount} segment(s), ${formatBytes(result.totalBytes)}, saved securely.`,
          interrupted: result.continuity === "interrupted",
          interruptionCount: result.interruptionCount,
          transcriptionEnabled: result.transcriptionEnabled,
        });
        dispatch({ type: "FINISH_SUCCEEDED" });
        return;
      }
      if ("incompleteChunkIndexes" in result) {
        for (const index of result.incompleteChunkIndexes) await setChunkState(sid, index, "pending");
        continue;
      }
      setError(result.error);
      dispatch({ type: "FINISH_FAILED" });
      return;
    }
    setError("Some audio could not be verified after several attempts. Your audio is safe on this device — tap Finish to try again.");
    dispatch({ type: "FINISH_FAILED" });
  }

  function handleKeepRecording() {
    setNotice("Finishing cancelled. Tap Resume to keep recording — a new part will start.");
    dispatch({ type: "FINISH_CANCELLED" });
  }

  // ─── Effects ──────────────────────────────────────────────────────────────────────────────

  // On load with an in-progress assessment: recover this device's chunks and run log. A run that
  // was still open was cut off by the page closing/reloading (knowable); otherwise the reason is
  // not known and none is invented.
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    void (async () => {
      const [local, runs] = await Promise.all([getChunksForSession(sid), getRunsForSession(sid).catch(() => [] as RunLogEntry[])]);
      const lastChunkAtByRun = new Map<string, number>();
      for (const c of local) lastChunkAtByRun.set(c.runId, Math.max(lastChunkAtByRun.get(c.runId) ?? 0, c.recordedAt));
      const hadOpenRun = runs.some((r) => r.endedAt === null);
      runLogRef.current = runs;
      updateRunLog(() => closeRunsOpenAtLoad(runs, lastChunkAtByRun));
      nextIndexRef.current = Math.max(nextIndexRef.current, deriveNextChunkIndex([], local.map((c) => c.chunkIndex)));
      setCounts(countChunks(local));
      dispatch({ type: "LOADED_WITH_PRIOR_AUDIO" });
      setInterruptionText(
        hadOpenRun
          ? interruptionMessage("page_closed_or_reloaded")
          : "This assessment is already in progress. Everything already recorded is saved. Tap Resume recording to continue."
      );
      void runUploadLoop();
    })();
  }, [dispatch, runUploadLoop, updateRunLog]);

  useEffect(() => {
    if (!timerShouldRun(phase)) return;
    const timer = setInterval(() => {
      const start = segmentStartRef.current;
      setElapsed(elapsedBaseRef.current + (start !== null ? (Date.now() - start) / 1000 : 0));
    }, 500);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    function onOnline() {
      wakeSleepRef.current?.();
      void runUploadLoop();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [runUploadLoop]);

  // Hidden while recording = interruption, always: iOS suspends capture for a locked screen or a
  // backgrounded page, and continuity across a hidden period can never be proven afterwards.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        if (phaseRef.current === "recording") void interruptRef.current("page_hidden", Date.now());
      }
      void syncWakeLockRef.current?.();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const active = ["resuming", "recording", "paused", "finishing", "interrupted"].includes(phaseRef.current);
      if (active || counts.pending > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [counts.pending]);

  // Release the microphone and wake lock if the component unmounts (e.g. client navigation).
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      void sentinel?.release().catch(() => {});
    };
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────────────────────

  const backHref = `/residents/${residentId}`;

  if (phase === "captured" && done) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        {done.interrupted ? <AlertTriangle size={40} className="text-warning-text" /> : <CheckCircle2 size={40} className="text-success-text" />}
        <p className="font-sans text-base font-semibold text-body">{capturedAssessmentNotice(done.transcriptionEnabled).title}</p>
        {!done.transcriptionEnabled && (
          <p className="max-w-md font-sans text-sm text-body">{capturedAssessmentNotice(false).detail}</p>
        )}
        {done.interrupted && (
          <p className="rounded-lg border border-warning-text/30 bg-warning-surface px-3 py-2 font-sans text-sm text-warning-text">
            This recording was interrupted{done.interruptionCount > 0 ? ` ${done.interruptionCount} time${done.interruptionCount === 1 ? "" : "s"}` : ""}. Some of
            the conversation may not have been recorded.
          </p>
        )}
        <p className="font-sans text-sm text-muted">{done.summary}</p>
        <Link href={backHref} className="mt-2 rounded-lg bg-navy px-6 py-3 font-sans text-button font-medium text-white">
          Back to {residentDisplayName}
        </Link>
      </div>
    );
  }

  const guidance = wakeLockGuidance({ status: wakeLockAvailable ? wakeLockStatus : "unsupported", phase });
  const guidanceClass =
    guidance.tone === "protected"
      ? "border-success-text/30 bg-success-surface text-success-text"
      : guidance.tone === "warning"
        ? "border-warning-text/30 bg-warning-surface text-warning-text"
        : "border-ivory-border bg-ivory text-body";
  const interruptedLike = phase === "interrupted" || phase === "error";

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col gap-5 px-4 py-6">
      <div className="text-center">
        <p className="font-sans text-sm uppercase tracking-wide text-muted">Assessing</p>
        <h1 className="mt-1 font-serif text-2xl font-light text-body">{residentDisplayName}</h1>
      </div>

      {interruptedLike && interruptionText && (
        <div role="alert" className="rounded-lg border-2 border-danger-text bg-red-50 px-4 py-3 font-sans text-danger-text">
          <p className="flex items-center gap-2 text-base font-semibold">
            <MicOff size={18} /> Recording interrupted
          </p>
          <p className="mt-1 text-sm">{interruptionText}</p>
        </div>
      )}

      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 font-sans text-sm ${guidanceClass}`}>
        {guidance.tone === "protected" ? <ShieldCheck size={18} className="mt-0.5 shrink-0" /> : <Smartphone size={18} className="mt-0.5 shrink-0" />}
        <p>
          <strong>{guidance.title}.</strong> {guidance.body}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div
          className={`flex h-36 w-36 items-center justify-center rounded-full border-4 ${
            phase === "recording" ? "border-danger-text" : interruptedLike ? "border-warning-text" : "border-ivory-border"
          }`}
        >
          {phase === "finishing" || phase === "resuming" ? (
            <Loader2 size={44} className="animate-spin text-navy" />
          ) : interruptedLike ? (
            <MicOff size={44} className="text-warning-text" />
          ) : (
            <Mic size={44} className={phase === "recording" ? "text-danger-text" : "text-muted"} />
          )}
        </div>
        <p className="font-mono text-4xl font-light text-body">{formatTimer(elapsed)}</p>
        <p className="font-sans text-sm font-medium text-muted" aria-live="polite">
          {PHASE_LABEL[phase]}
        </p>
        {interruptionCount > 0 && (
          <p className="text-center font-sans text-xs text-warning-text">
            Interrupted {interruptionCount} time{interruptionCount === 1 ? "" : "s"} so far — every part is saved to this same assessment.
          </p>
        )}
      </div>

      {notice && <p className="rounded-lg bg-ivory px-3 py-2 font-sans text-sm text-body">{notice}</p>}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-danger-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {counts.total > 0 && (
        <p className="text-center font-sans text-xs text-muted" aria-live="polite">
          {counts.pending === 0
            ? `All ${counts.uploaded} segment${counts.uploaded === 1 ? "" : "s"} on this device uploaded.`
            : `Uploading… ${counts.uploaded}/${counts.total} segments uploaded.`}
          {counts.conflicts > 0 && ` ${counts.conflicts} segment(s) in conflict.`}
          {counts.orphaned > 0 && ` ${counts.orphaned} segment(s) belong to an already-finished assessment.`}
        </p>
      )}
      {uploadNote && <p className="text-center font-sans text-xs text-warning-text">{uploadNote}</p>}

      <div className="mt-auto space-y-3">
        {phase === "finishing" ? (
          <button
            type="button"
            onClick={handleKeepRecording}
            className="w-full min-h-[52px] rounded-lg border border-ivory-border py-3 font-sans text-button font-medium text-body"
          >
            Cancel finishing and keep recording
          </button>
        ) : (
          <>
            {interruptedLike && (
              <p className="text-center font-sans text-xs text-muted">
                Finishing now saves only what was recorded, and the assessment will be marked as interrupted.
              </p>
            )}
            <div className="flex gap-3">
              {phase === "ready" || phase === "resuming" ? (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={phase === "resuming"}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-3 font-sans text-button font-medium text-white disabled:opacity-50"
                >
                  <Play size={18} /> {hasSession ? "Resume recording" : "Start recording"}
                </button>
              ) : phase === "recording" ? (
                <button
                  type="button"
                  onClick={handlePause}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-3 font-sans text-button font-medium text-white"
                >
                  <Pause size={18} /> Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleResume}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-3 font-sans text-button font-medium text-white"
                >
                  <Play size={18} /> {phase === "paused" ? "Resume" : "Resume recording"}
                </button>
              )}
              {(phase === "recording" || phase === "paused" || interruptedLike) && (
                <button
                  type="button"
                  onClick={handleFinish}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg bg-gold-dark py-3 font-sans text-button font-medium text-white"
                >
                  <Square size={16} /> Finish Assessment
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
