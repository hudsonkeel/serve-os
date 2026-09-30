"use client";

// Assessment Mobile Capture v0.1 — native in-browser assessment recorder (pilot).
//
// Reliability model (ported from feature/assessment-aws-transcription-pipeline's CaptureScreen,
// itself from serve-intake-mvp, with that branch's defects fixed):
//   - ONE MediaRecorder per run, paused/resumed with pause()/resume() — never stopped and
//     recreated for an ordinary pause. A new run (new runId) starts only when the previous
//     recorder genuinely ended (screen lock, phone call, track ended, reload).
//   - every blob is written to IndexedDB, with its metadata, BEFORE any network attempt;
//   - chunk indexes only ever increase: the starting index is derived from the server's stored
//     objects AND this device's local copies, so a reload never reuses an index;
//   - a single upload loop retries transient failures with capped backoff, treats "already
//     stored identically" as success, and stops on a conflict instead of looping forever;
//   - Finish stops the recorder, waits for every local chunk to upload, and only then asks the
//     server to verify and finalize ('captured'). There is no "Finish Without Waiting".
// Original blobs are preserved exactly — nothing here concatenates or re-encodes audio.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Pause, Play, Square, Loader2, AlertTriangle, CheckCircle2, Smartphone } from "lucide-react";
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
} from "@/lib/assessmentCapture/captureLogic";
import { addChunk, deleteChunksForSession, getChunksForSession, setChunkState, type LocalChunkRecord } from "@/lib/assessmentCapture/idb";

type Phase = "ready" | "starting" | "recording" | "paused" | "interrupted" | "finishing" | "done" | "blocked" | "fatal";

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

function countChunks(chunks: readonly LocalChunkRecord[]): Counts {
  return {
    total: chunks.length,
    uploaded: chunks.filter((c) => c.state === "uploaded").length,
    pending: chunks.filter((c) => c.state === "pending").length,
    conflicts: chunks.filter((c) => c.state === "conflict").length,
    orphaned: chunks.filter((c) => c.state === "orphaned").length,
  };
}

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

interface CaptureScreenProps {
  residentId: string;
  residentDisplayName: string;
  initialState: NativeCaptureStartState;
}

export function CaptureScreen({ residentId, residentDisplayName, initialState }: CaptureScreenProps) {
  const [phase, setPhaseState] = useState<Phase>(initialState.kind === "blocked" ? "blocked" : "ready");
  const [elapsed, setElapsed] = useState(0);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialState.kind === "blocked" ? initialState.error : null);
  const [notice, setNotice] = useState<string | null>(
    initialState.kind === "resumable"
      ? `Resuming an in-progress capture — ${initialState.session.uploadedChunkCount} segment(s) already saved.`
      : null
  );
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [doneSummary, setDoneSummary] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(initialState.kind === "resumable");

  const phaseRef = useRef<Phase>(phase);
  const sessionIdRef = useRef<string | null>(initialState.kind === "resumable" ? initialState.session.assessmentSessionId : null);
  const nextIndexRef = useRef<number>(initialState.kind === "resumable" ? initialState.session.serverNextChunkIndex : 0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runIdRef = useRef<string | null>(null);
  const pendingWritesRef = useRef<Set<Promise<void>>>(new Set());
  const stopWaitersRef = useRef<(() => void)[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const elapsedBaseRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const loopRunningRef = useRef(false);
  const loopKickRef = useRef(false);
  const wakeSleepRef = useRef<(() => void) | null>(null);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const refreshCounts = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return EMPTY_COUNTS;
    const next = countChunks(await getChunksForSession(sid));
    setCounts(next);
    return next;
  }, []);

  // ─── Upload loop ──────────────────────────────────────────────────────────────────────────

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

  // ─── Wake lock ────────────────────────────────────────────────────────────────────────────

  const acquireWakeLock = useCallback(async () => {
    if (wakeLockRef.current || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener("release", () => {
        wakeLockRef.current = null;
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    setWakeLockActive(false);
    if (sentinel) await sentinel.release().catch(() => {});
  }, []);

  // ─── Recorder lifecycle ───────────────────────────────────────────────────────────────────

  const accumulateElapsed = useCallback(() => {
    if (segmentStartRef.current !== null) {
      elapsedBaseRef.current += (Date.now() - segmentStartRef.current) / 1000;
      segmentStartRef.current = null;
    }
    setElapsed(elapsedBaseRef.current);
  }, []);

  /** Stops the current recorder (if any), waits for its final blob to be persisted locally, and
   * releases the microphone. Resolves only after every in-flight IndexedDB write settles. */
  const endRun = useCallback(async () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        stopWaitersRef.current.push(resolve);
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });
    }
    recorderRef.current = null;
    runIdRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    await Promise.allSettled([...pendingWritesRef.current]);
  }, []);

  const handleInterruption = useCallback(
    async (message: string) => {
      if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
      accumulateElapsed();
      setPhase("interrupted");
      setNotice(message);
      await endRun();
      await releaseWakeLock();
      void runUploadLoop();
    },
    [accumulateElapsed, endRun, releaseWakeLock, runUploadLoop, setPhase]
  );

  const beginRun = useCallback(
    (stream: MediaStream) => {
      const chosen = pickRecorderMimeType(typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported?.bind(MediaRecorder) : null);
      const recorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
      const recorderMime = recorder.mimeType || chosen;
      if (recorderMime && !mimeTypeToExtension(recorderMime)) {
        throw new Error(`This browser records audio as "${recorderMime}", which the pilot does not support yet.`);
      }
      const runId = newRunId();
      recorderRef.current = recorder;
      streamRef.current = stream;
      runIdRef.current = runId;

      recorder.ondataavailable = (event: BlobEvent) => {
        const sid = sessionIdRef.current;
        if (!sid || !event.data || event.data.size === 0) return;
        const chunkIndex = nextIndexRef.current++;
        const mimeType = event.data.type || recorder.mimeType || chosen;
        if (!mimeTypeToExtension(mimeType)) {
          setError(`Recorded audio type "${mimeType || "unknown"}" is not supported — this segment was not saved.`);
          return;
        }
        const write = addChunk({
          sessionId: sid,
          chunkIndex,
          runId,
          blob: event.data,
          mimeType,
          size: event.data.size,
          recordedAt: Date.now(),
        })
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
        const waiters = stopWaitersRef.current;
        stopWaitersRef.current = [];
        waiters.forEach((w) => w());
      };
      recorder.onerror = () => {
        void handleInterruption("The recorder stopped unexpectedly. Tap Resume to continue — a new segment will start.");
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          void handleInterruption(
            "The microphone was disconnected or taken by another app (for example a phone call). Tap Resume to continue — a new segment will start."
          );
        };
      });

      recorder.start(CHUNK_TIMESLICE_MS);
      segmentStartRef.current = Date.now();
    },
    [handleInterruption, refreshCounts, runUploadLoop]
  );

  const openMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(microphoneErrorMessage("NotSupportedError"));
      return null;
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(microphoneErrorMessage(err instanceof DOMException ? err.name : null));
      return null;
    }
  }, []);

  async function handleStart() {
    setError(null);
    setPhase("starting");
    const stream = await openMicrophone();
    if (!stream) {
      setPhase(sessionIdRef.current ? "interrupted" : "ready");
      return;
    }

    if (!sessionIdRef.current) {
      const result = await startOrResumeNativeCapture(residentId).catch(() => ({ error: "Could not reach Serve OS. Check the connection and try again." }));
      if (!("session" in result) || !result.session) {
        stream.getTracks().forEach((t) => t.stop());
        setError(result.error ?? "Could not start the assessment.");
        setPhase("ready");
        return;
      }
      sessionIdRef.current = result.session.assessmentSessionId;
      setHasSession(true);
      nextIndexRef.current = result.session.serverNextChunkIndex;
      if (result.session.resumed) setNotice(`Resuming an in-progress capture — ${result.session.uploadedChunkCount} segment(s) already saved.`);
    }

    // Never reuse an index: take the larger of the server-derived next index and anything this
    // device already holds locally (chunks recorded before a reload that haven't uploaded yet).
    const local = await getChunksForSession(sessionIdRef.current!);
    nextIndexRef.current = Math.max(nextIndexRef.current, deriveNextChunkIndex([], local.map((c) => c.chunkIndex)));

    try {
      beginRun(stream);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setError(err instanceof Error ? err.message : microphoneErrorMessage(null));
      setPhase("ready");
      return;
    }
    await acquireWakeLock();
    setPhase("recording");
    void runUploadLoop();
  }

  function handlePause() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    try {
      recorder.pause();
    } catch {
      void handleInterruption("The recorder could not pause. Tap Resume to continue — a new segment will start.");
      return;
    }
    accumulateElapsed();
    setPhase("paused");
  }

  async function handleResume() {
    const recorder = recorderRef.current;
    const trackLive = streamRef.current?.getAudioTracks().some((t) => t.readyState === "live") ?? false;
    if (recorder && recorder.state === "paused" && trackLive) {
      try {
        recorder.resume();
        segmentStartRef.current = Date.now();
        setPhase("recording");
        await acquireWakeLock();
        return;
      } catch {
        // Fall through to a fresh run.
      }
    }
    await endRun();
    setNotice(null);
    await handleStart();
  }

  async function handleFinish() {
    setError(null);
    accumulateElapsed();
    setPhase("finishing");
    await endRun();
    await releaseWakeLock();

    const sid = sessionIdRef.current;
    if (!sid) {
      setError("Nothing has been recorded yet.");
      setPhase("ready");
      return;
    }

    for (let attempt = 0; attempt < MAX_FINISH_VERIFY_ATTEMPTS; attempt++) {
      // 1. Wait until every locally-persisted chunk has uploaded.
      while (true) {
        if (phaseRef.current !== "finishing") return; // user chose to keep recording
        void runUploadLoop();
        const c = await refreshCounts();
        if (c.conflicts > 0) {
          setError("Some audio segments conflict with audio already stored. The assessment cannot be finished — contact an administrator.");
          setPhase("interrupted");
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
        result = await finishNativeCapture({ residentId, assessmentSessionId: sid, manifest });
      } catch {
        setError("Could not reach Serve OS to finish. Your audio is safe — check the connection and tap Finish again.");
        setPhase("interrupted");
        return;
      }
      if ("status" in result) {
        await deleteChunksForSession(sid).catch(() => {});
        setDoneSummary(`${result.chunkCount} segment(s), ${formatBytes(result.totalBytes)}, saved securely.`);
        setPhase("done");
        return;
      }
      if ("incompleteChunkIndexes" in result) {
        // The server doesn't have (or doesn't match) these — re-upload them, then verify again.
        for (const index of result.incompleteChunkIndexes) await setChunkState(sid, index, "pending");
        continue;
      }
      setError(result.error);
      setPhase("interrupted");
      return;
    }
    setError("Some audio could not be verified after several attempts. Your audio is safe on this device — tap Finish to try again.");
    setPhase("interrupted");
  }

  function handleKeepRecording() {
    setNotice("Finishing cancelled. Tap Resume to keep recording — a new segment will start.");
    setPhase("interrupted");
  }

  // ─── Effects ──────────────────────────────────────────────────────────────────────────────

  // On load: pick up any chunks this device persisted for the resumable session before a
  // reload, and derive the next index from them.
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    void (async () => {
      const local = await getChunksForSession(sid);
      nextIndexRef.current = Math.max(nextIndexRef.current, deriveNextChunkIndex([], local.map((c) => c.chunkIndex)));
      setCounts(countChunks(local));
      void runUploadLoop();
    })();
  }, [runUploadLoop]);

  useEffect(() => {
    if (phase !== "recording") return;
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

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        if (phaseRef.current === "recording") hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (phaseRef.current !== "recording" && phaseRef.current !== "paused") return;
      const recorder = recorderRef.current;
      const trackLive = streamRef.current?.getAudioTracks().some((t) => t.readyState === "live") ?? false;
      if (!recorder || recorder.state === "inactive" || !trackLive) {
        void handleInterruption(
          "Recording stopped while the screen was locked or another app was open. Tap Resume to continue — a new segment will start."
        );
        return;
      }
      void acquireWakeLock();
      if (hiddenAt !== null && Date.now() - hiddenAt > 2000) {
        setNotice("The screen was off or another app was open — part of the conversation may not have been recorded.");
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [acquireWakeLock, handleInterruption]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const active = ["starting", "recording", "paused", "finishing"].includes(phaseRef.current);
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
      void wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────────────────────

  const backHref = `/residents/${residentId}`;

  if (phase === "done") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <CheckCircle2 size={40} className="text-success-text" />
        <p className="font-sans text-base font-semibold text-body">Audio captured — awaiting transcription</p>
        <p className="font-sans text-sm text-muted">{doneSummary}</p>
        <Link href={backHref} className="mt-2 rounded-lg bg-navy px-6 py-3 font-sans text-button font-medium text-white">
          Back to {residentDisplayName}
        </Link>
      </div>
    );
  }

  const isActive = phase === "recording" || phase === "paused";

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col gap-5 px-4 py-6">
      <div className="rounded-lg border border-warning-text/30 bg-warning-surface px-3 py-2 font-sans text-xs text-warning-text">
        <strong>Mobile Capture Pilot</strong> — fictional role-play test data only. Audio is saved but not transcribed yet.
      </div>

      <div className="text-center">
        <p className="font-sans text-sm uppercase tracking-wide text-muted">Assessing</p>
        <h1 className="mt-1 font-serif text-2xl font-light text-body">{residentDisplayName}</h1>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-ivory-border bg-ivory px-3 py-2 font-sans text-sm text-body">
        <Smartphone size={18} className="mt-0.5 shrink-0 text-muted" />
        <p>
          <strong>Keep this screen open and unlocked while recording.</strong> Locking the phone, taking a call, or
          switching apps can stop the recording.{" "}
          {wakeLockActive ? "The screen will stay awake." : "Turn off Auto-Lock or tap the screen occasionally."}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div
          className={`flex h-36 w-36 items-center justify-center rounded-full border-4 ${
            phase === "recording" ? "border-danger-text" : "border-ivory-border"
          }`}
        >
          {phase === "finishing" || phase === "starting" ? (
            <Loader2 size={44} className="animate-spin text-navy" />
          ) : (
            <Mic size={44} className={phase === "recording" ? "text-danger-text" : "text-muted"} />
          )}
        </div>
        <p className="font-mono text-4xl font-light text-body">{formatTimer(elapsed)}</p>
        <p className="font-sans text-sm font-medium text-muted" aria-live="polite">
          {phase === "recording"
            ? "Recording"
            : phase === "paused"
              ? "Paused"
              : phase === "finishing"
                ? "Finishing — uploading remaining audio…"
                : phase === "starting"
                  ? "Starting microphone…"
                  : phase === "interrupted"
                    ? "Stopped"
                    : phase === "blocked"
                      ? "Unavailable"
                      : "Ready"}
        </p>
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
        {phase === "blocked" ? (
          <Link href={backHref} className="block w-full rounded-lg border border-ivory-border py-3 text-center font-sans text-button font-medium text-body">
            Back to {residentDisplayName}
          </Link>
        ) : phase === "finishing" ? (
          <button
            type="button"
            onClick={handleKeepRecording}
            className="w-full min-h-[52px] rounded-lg border border-ivory-border py-3 font-sans text-button font-medium text-body"
          >
            Cancel finishing and keep recording
          </button>
        ) : (
          <div className="flex gap-3">
            {phase === "ready" || phase === "starting" ? (
              <button
                type="button"
                onClick={handleStart}
                disabled={phase === "starting"}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-3 font-sans text-button font-medium text-white disabled:opacity-50"
              >
                <Play size={18} /> {hasSession ? "Resume recording" : "Start recording"}
              </button>
            ) : (
              <button
                type="button"
                onClick={phase === "recording" ? handlePause : handleResume}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-3 font-sans text-button font-medium text-white"
              >
                {phase === "recording" ? <Pause size={18} /> : <Play size={18} />}
                {phase === "recording" ? "Pause" : "Resume"}
              </button>
            )}
            {(isActive || phase === "interrupted") && (
              <button
                type="button"
                onClick={handleFinish}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg bg-gold-dark py-3 font-sans text-button font-medium text-white"
              >
                <Square size={16} /> Finish Assessment
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
