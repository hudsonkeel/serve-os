"use client";

// Native Serve OS assessment capture — ported from serve-intake-mvp's public/capture/app.js.
// Reliability mechanics are preserved deliberately unchanged: MediaRecorder with the same
// MIME/codec fallback chain, ~10s chunks, IndexedDB write BEFORE any network attempt, an
// upload loop that retries indefinitely on failure, and Finish draining pending uploads before
// completing (with a "Finish Without Waiting" escape hatch). See this scope's completion
// report for exactly what was ported unchanged vs. adapted.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Pause, Play, Square, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  finishNativeAssessmentCaptureAction,
  getSignedAudioChunkUploadUrlAction,
} from "@/lib/actions/assessmentCapture";
import { getChunksForSession, getPendingChunks, markUploaded, putChunk } from "@/lib/assessmentCapture/idb";

const CHUNK_SLICE_MS = 10000;
const UPLOAD_RETRY_DELAY_MS = 4000;
const ACTIVE_SESSION_KEY_PREFIX = "serve_os_assessment_capture_";

interface ActiveSessionMeta {
  assessmentSessionId: string;
  nextChunkIndex: number;
  elapsedSecondsAtPause: number;
}

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const type of candidates) {
    if (typeof window !== "undefined" && window.MediaRecorder && MediaRecorder.isTypeSupported?.(type)) {
      return type;
    }
  }
  return "";
}

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

type RecordingState = "idle" | "recording" | "paused" | "finishing" | "done" | "error";

interface CaptureScreenProps {
  residentId: string;
  residentDisplayName: string;
  initialSession: { assessmentSessionId: string; nextChunkIndex: number; elapsedSecondsAtPause: number };
}

export function CaptureScreen({ residentId, residentDisplayName, initialSession }: CaptureScreenProps) {
  const router = useRouter();
  const storageKey = `${ACTIVE_SESSION_KEY_PREFIX}${residentId}`;

  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(initialSession.elapsedSecondsAtPause);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finishSummary, setFinishSummary] = useState<string | null>(null);

  const sessionRef = useRef<ActiveSessionMeta>(initialSession);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadLoopRunningRef = useRef(false);

  const saveSessionMeta = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessionRef.current));
    } catch {
      // Non-fatal — IndexedDB is the real durability layer; localStorage here is only a
      // convenience for resuming into the right screen after a reload.
    }
  }, [storageKey]);

  const refreshUploadStatus = useCallback(async () => {
    const all = await getChunksForSession(sessionRef.current.assessmentSessionId);
    const pending = all.filter((c) => !c.uploaded);
    setTotalCount(all.length);
    setPendingCount(pending.length);
  }, []);

  const uploadOneChunk = useCallback(
    async (chunk: { sessionId: string; chunkIndex: number; blob: Blob; mimeType: string }): Promise<boolean> => {
      const urlResult = await getSignedAudioChunkUploadUrlAction({
        residentId,
        assessmentSessionId: chunk.sessionId,
        chunkIndex: chunk.chunkIndex,
      });
      if (urlResult.error || !urlResult.uploadUrl) return false;
      try {
        const putResponse = await fetch(urlResult.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": chunk.mimeType || "audio/webm" },
          body: chunk.blob,
        });
        return putResponse.ok;
      } catch {
        return false; // offline or transient failure — caller retries
      }
    },
    [residentId]
  );

  const ensureUploadLoop = useCallback(() => {
    if (uploadLoopRunningRef.current) return;
    uploadLoopRunningRef.current = true;

    (async () => {
      try {
        while (true) {
          const pending = await getPendingChunks(sessionRef.current.assessmentSessionId);
          if (pending.length === 0) break;
          const chunk = pending[0];
          const uploaded = await uploadOneChunk(chunk);
          if (!uploaded) {
            await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS));
            continue;
          }
          await markUploaded(chunk.sessionId, chunk.chunkIndex);
          await refreshUploadStatus();
        }
      } finally {
        uploadLoopRunningRef.current = false;
        await refreshUploadStatus();
      }
    })();
  }, [uploadOneChunk, refreshUploadStatus]);

  const tickTimer = useCallback(() => {
    const base = sessionRef.current.elapsedSecondsAtPause;
    if (state !== "recording" || recordingStartedAtRef.current === null) {
      setElapsed(base);
      return;
    }
    setElapsed(base + (Date.now() - recordingStartedAtRef.current) / 1000);
  }, [state]);

  useEffect(() => {
    if (state === "recording") {
      if (!timerIntervalRef.current) timerIntervalRef.current = setInterval(tickTimer, 500);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [state, tickTimer]);

  // Warn against closing the tab while actively recording — genuinely new, not present in the
  // source engine (which had no beforeunload handler at all). Does not change the durability
  // model — already-captured chunks are IndexedDB-safe regardless — this is only a speed bump
  // against losing the REMAINING, not-yet-recorded portion of the conversation by accident.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (state === "recording") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  useEffect(() => {
    refreshUploadStatus();
    ensureUploadLoop();
    // Resume-on-load: if chunks already exist in IndexedDB for this session (a prior recording
    // was interrupted), the upload loop above picks them up immediately. Recording itself is
    // never auto-resumed — same discipline as the source engine: the mic cannot be kept alive
    // across a real page reload, so the user explicitly taps Start again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was denied or unavailable. Grant microphone permission to record.");
      setState("error");
      return;
    }

    streamRef.current = stream;
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = async (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      const chunkIndex = sessionRef.current.nextChunkIndex;
      sessionRef.current = { ...sessionRef.current, nextChunkIndex: chunkIndex + 1 };
      saveSessionMeta();
      try {
        await putChunk(sessionRef.current.assessmentSessionId, chunkIndex, event.data, recorder.mimeType || "audio/webm");
      } catch {
        // Local persistence failed — the one failure mode this design cannot route around.
        setError("Warning: could not save the last audio segment on this device.");
        return;
      }
      ensureUploadLoop();
      refreshUploadStatus();
    };

    recorder.start(CHUNK_SLICE_MS);
    recordingStartedAtRef.current = Date.now();
    setState("recording");
  }

  function stopRecordingInternal() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (state === "recording" && recordingStartedAtRef.current !== null) {
      sessionRef.current = {
        ...sessionRef.current,
        elapsedSecondsAtPause: sessionRef.current.elapsedSecondsAtPause + (Date.now() - recordingStartedAtRef.current) / 1000,
      };
      saveSessionMeta();
    }
    recordingStartedAtRef.current = null;
  }

  function handlePauseResume() {
    if (state === "recording") {
      stopRecordingInternal();
      setState("paused");
    } else {
      startRecording();
    }
  }

  async function handleFinish() {
    stopRecordingInternal();
    setState("finishing");

    // Give the upload loop a chance to drain, same as the source engine — "Finish Without
    // Waiting" lets the assessor proceed immediately if connectivity is bad; already-captured
    // audio remains safely in IndexedDB and the upload loop keeps retrying regardless.
    const pollInterval = setInterval(async () => {
      const pending = await getPendingChunks(sessionRef.current.assessmentSessionId);
      await refreshUploadStatus();
      if (pending.length === 0) {
        clearInterval(pollInterval);
        await completeFinish();
      }
    }, 1500);

    // Stored so a "Finish Without Waiting" tap (rendered below while state === 'finishing')
    // can clear the same interval.
    finishPollIntervalRef.current = pollInterval;
  }

  const finishPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleFinishWithoutWaiting() {
    if (finishPollIntervalRef.current) clearInterval(finishPollIntervalRef.current);
    await completeFinish();
  }

  async function completeFinish() {
    const result = await finishNativeAssessmentCaptureAction({
      residentId,
      assessmentSessionId: sessionRef.current.assessmentSessionId,
      chunkCount: sessionRef.current.nextChunkIndex,
    });

    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Non-fatal.
    }

    if (result.error) {
      setError(result.error);
      setFinishSummary(`${residentDisplayName} · ${sessionRef.current.nextChunkIndex} recorded segment(s) — could not confirm processing.`);
    } else {
      // Finish no longer waits for transcription/extraction — the recording is safely
      // finalized and a background worker picks up processing independently. It's safe to
      // leave this page, lock the phone, or start something else; progress is visible from
      // this resident's Assessment History whenever it's checked next.
      setFinishSummary(`${residentDisplayName} · assessment recorded. Processing the conversation now — you may leave this page.`);
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <CheckCircle2 size={40} className="text-success-text" />
        <p className="font-sans text-base text-body">{finishSummary}</p>
        <button
          type="button"
          onClick={() => router.push(`/residents/${residentId}`)}
          className="mt-2 rounded-lg bg-navy px-6 py-3 font-sans text-button font-medium text-white"
        >
          Back to {residentDisplayName}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-between px-6 py-8">
      <div className="w-full text-center">
        <p className="font-sans text-sm uppercase tracking-wide text-muted">Assessing</p>
        <h1 className="mt-1 font-serif text-2xl font-light text-body">{residentDisplayName}</h1>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div
          className={`flex h-40 w-40 items-center justify-center rounded-full border-4 ${
            state === "recording" ? "border-danger-text" : "border-ivory-border"
          }`}
        >
          {state === "finishing" ? (
            <Loader2 size={48} className="animate-spin text-navy" />
          ) : (
            <Mic size={48} className={state === "recording" ? "text-danger-text" : "text-muted"} />
          )}
        </div>
        <p className="font-mono text-4xl font-light text-body">{formatTimer(elapsed)}</p>
        <p className="font-sans text-sm font-medium text-muted">
          {state === "recording" ? "Recording" : state === "finishing" ? "Finishing…" : "Paused"}
        </p>
      </div>

      <div className="w-full space-y-3">
        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-danger-text">
            <AlertTriangle size={16} /> {error}
          </p>
        )}

        {totalCount > 0 && (
          <p className="text-center font-sans text-xs text-muted">
            {pendingCount === 0
              ? `All ${totalCount} recorded segment${totalCount === 1 ? "" : "s"} saved.`
              : `Saving… ${totalCount - pendingCount}/${totalCount} segments uploaded.`}
          </p>
        )}

        {state === "finishing" ? (
          <button
            type="button"
            onClick={handleFinishWithoutWaiting}
            className="w-full min-h-[52px] rounded-lg border border-ivory-border py-3 font-sans text-button font-medium text-body"
          >
            Finish Without Waiting
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={state === "idle" ? startRecording : handlePauseResume}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg bg-navy py-3 font-sans text-button font-medium text-white"
            >
              {state === "recording" ? <Pause size={18} /> : <Play size={18} />}
              {state === "idle" ? "Start Recording" : state === "recording" ? "Pause" : "Resume"}
            </button>
            {state !== "idle" && (
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
