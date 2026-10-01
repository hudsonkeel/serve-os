import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  transitionRecordingPhase,
  timerShouldRun,
  isCaptureActive,
  shouldPersistRecordedBlob,
  decideWakeLockAction,
  wakeLockGuidance,
  classifyCaptureHealth,
  decideResumePlan,
  decideSessionForStart,
  creditedSegmentSeconds,
  openRun,
  closeOpenRun,
  closeRunsOpenAtLoad,
  summarizeContinuity,
  sanitizeRunLog,
  shouldClearLocalCaptureData,
  isInterruptionReason,
  interruptionMessage,
  RUN_END_REASONS,
  type RecordingPhase,
  type RecordingEvent,
  type RunLogEntry,
} from "../recordingHealth.ts";
import { deriveNextChunkIndex, decideCaptureFinalize, type StoredChunk } from "../captureLogic.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const codeOf = (rel: string) =>
  readFileSync(join(repoRoot, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PHASES: RecordingPhase[] = ["ready", "resuming", "recording", "paused", "interrupted", "finishing", "captured", "error"];
const EVENTS: RecordingEvent[] = [
  { type: "START_REQUESTED" },
  { type: "RECORDER_STARTED" },
  { type: "START_FAILED", hasPriorAudio: true },
  { type: "START_FAILED", hasPriorAudio: false },
  { type: "PAUSE" },
  { type: "RESUMED_SAME_RUN" },
  { type: "INTERRUPTED" },
  { type: "FINISH_REQUESTED" },
  { type: "FINISH_CANCELLED" },
  { type: "FINISH_SUCCEEDED" },
  { type: "FINISH_FAILED" },
  { type: "LOADED_WITH_PRIOR_AUDIO" },
];
const RUN_A = "a1b2c3d4e5f60718";
const RUN_B = "0f1e2d3c4b5a6978";
const RUN_C = "1122334455667788";
const T0 = 1_759_000_000_000;

// ─── state machine ──────────────────────────────────────────────────────────────────────────

test("transitions: the normal path ready → resuming → recording → paused → recording → finishing → captured", () => {
  let p: RecordingPhase = "ready";
  p = transitionRecordingPhase(p, { type: "START_REQUESTED" });
  assert.equal(p, "resuming");
  p = transitionRecordingPhase(p, { type: "RECORDER_STARTED" });
  assert.equal(p, "recording");
  p = transitionRecordingPhase(p, { type: "PAUSE" });
  assert.equal(p, "paused");
  p = transitionRecordingPhase(p, { type: "RESUMED_SAME_RUN" });
  assert.equal(p, "recording");
  p = transitionRecordingPhase(p, { type: "FINISH_REQUESTED" });
  assert.equal(p, "finishing");
  p = transitionRecordingPhase(p, { type: "FINISH_SUCCEEDED" });
  assert.equal(p, "captured");
});

test("transitions: an interruption from recording or paused lands in 'interrupted' and requires an explicit resume", () => {
  assert.equal(transitionRecordingPhase("recording", { type: "INTERRUPTED" }), "interrupted");
  assert.equal(transitionRecordingPhase("paused", { type: "INTERRUPTED" }), "interrupted");
  assert.equal(transitionRecordingPhase("resuming", { type: "INTERRUPTED" }), "interrupted");
  // Nothing resumes automatically: only START_REQUESTED leaves 'interrupted' for recording.
  for (const e of EVENTS) {
    const next = transitionRecordingPhase("interrupted", e);
    assert.ok(next === "interrupted" || next === "resuming" || next === "finishing", `${e.type} -> ${next}`);
  }
  assert.equal(transitionRecordingPhase("interrupted", { type: "RECORDER_STARTED" }), "interrupted");
  assert.equal(transitionRecordingPhase("interrupted", { type: "RESUMED_SAME_RUN" }), "interrupted");
});

test("transitions: a late interruption signal after Finish began (or after captured) is ignored", () => {
  assert.equal(transitionRecordingPhase("finishing", { type: "INTERRUPTED" }), "finishing");
  assert.equal(transitionRecordingPhase("captured", { type: "INTERRUPTED" }), "captured");
});

test("transitions: 'captured' is terminal", () => {
  for (const e of EVENTS) assert.equal(transitionRecordingPhase("captured", e), "captured", e.type);
});

test("transitions: a failed first start returns to ready; a failed resume stays interrupted", () => {
  assert.equal(transitionRecordingPhase("resuming", { type: "START_FAILED", hasPriorAudio: false }), "ready");
  assert.equal(transitionRecordingPhase("resuming", { type: "START_FAILED", hasPriorAudio: true }), "interrupted");
});

test("transitions: reload with prior audio starts as 'interrupted', not 'recording'", () => {
  assert.equal(transitionRecordingPhase("ready", { type: "LOADED_WITH_PRIOR_AUDIO" }), "interrupted");
});

test("transitions: Finish is allowed after an interruption (preserves what exists), and a failed Finish can be retried", () => {
  assert.equal(transitionRecordingPhase("interrupted", { type: "FINISH_REQUESTED" }), "finishing");
  assert.equal(transitionRecordingPhase("finishing", { type: "FINISH_FAILED" }), "error");
  assert.equal(transitionRecordingPhase("error", { type: "FINISH_REQUESTED" }), "finishing");
  assert.equal(transitionRecordingPhase("error", { type: "START_REQUESTED" }), "resuming");
});

test("transitions: the state machine has no 'queued' state and no path to it", () => {
  for (const p of PHASES) for (const e of EVENTS) assert.notEqual(transitionRecordingPhase(p, e) as string, "queued");
});

// ─── timer / capture health ─────────────────────────────────────────────────────────────────

test("timer runs ONLY while recording — stops for paused, interrupted, resuming, finishing, error, captured", () => {
  for (const p of PHASES) assert.equal(timerShouldRun(p), p === "recording", p);
});

test("timer credit for a hidden-page interruption ends when the page was hidden, not when the assessor returned", () => {
  const segmentStart = T0;
  const hiddenAt = T0 + 61_000;
  assert.equal(creditedSegmentSeconds(segmentStart, hiddenAt), 61);
  assert.equal(creditedSegmentSeconds(null, hiddenAt), 0);
  assert.equal(creditedSegmentSeconds(T0, T0 - 5), 0);
});

test("only recording/paused are interruptible capture states", () => {
  for (const p of PHASES) assert.equal(isCaptureActive(p), p === "recording" || p === "paused", p);
});

test("health: track ended / muted / recorder inactive are each detected; reason unknown is not guessed", () => {
  assert.equal(classifyCaptureHealth({ recorderState: "recording", trackReadyState: "ended", trackMuted: false }, "recording"), "track_ended");
  assert.equal(classifyCaptureHealth({ recorderState: "recording", trackReadyState: "live", trackMuted: true }, "recording"), "track_muted");
  assert.equal(classifyCaptureHealth({ recorderState: "inactive", trackReadyState: "live", trackMuted: false }, "recording"), "recorder_stopped_unexpectedly");
  assert.equal(classifyCaptureHealth({ recorderState: null, trackReadyState: "live", trackMuted: false }, "paused"), "recorder_stopped_unexpectedly");
  assert.equal(classifyCaptureHealth({ recorderState: "recording", trackReadyState: "live", trackMuted: false }, "paused"), "unknown");
  assert.equal(classifyCaptureHealth({ recorderState: "recording", trackReadyState: "live", trackMuted: false }, "recording"), null);
});

// ─── final dataavailable preservation ───────────────────────────────────────────────────────

test("every non-empty blob is persisted regardless of phase — including the final blob delivered during an interruption or Finish", () => {
  assert.equal(shouldPersistRecordedBlob({ sessionId: "s", size: 1234 }), true);
  assert.equal(shouldPersistRecordedBlob({ sessionId: "s", size: 0 }), false);
  assert.equal(shouldPersistRecordedBlob({ sessionId: null, size: 1234 }), false);
  assert.equal(shouldPersistRecordedBlob.length, 1, "phase must not be an input");
});

test("STATIC: the recorder's dataavailable handler persists via shouldPersistRecordedBlob with no phase gate", () => {
  const code = codeOf("components/residents/assessment/CaptureScreen.tsx");
  const handler = /recorder\.ondataavailable = \(event: BlobEvent\) => \{([\s\S]*?)\n {6}\};/.exec(code)?.[1] ?? "";
  assert.ok(handler.includes("shouldPersistRecordedBlob"), "handler must use the persistence rule");
  assert.ok(handler.includes("addChunk("), "handler must write to IndexedDB");
  assert.ok(!/phaseRef\.current|phase ===/.test(handler), "handler must not depend on phase");
});

// ─── Wake Lock ──────────────────────────────────────────────────────────────────────────────

test("wake lock: acquired automatically when recording + visible + supported", () => {
  assert.equal(decideWakeLockAction({ phase: "recording", visible: true, held: false, supported: true }), "acquire");
});

test("wake lock: released on intentional pause, interruption, finishing, captured, error", () => {
  for (const phase of ["paused", "interrupted", "finishing", "captured", "error", "ready", "resuming"] as RecordingPhase[]) {
    assert.equal(decideWakeLockAction({ phase, visible: true, held: true, supported: true }), "release", phase);
  }
});

test("wake lock: released when hidden; re-acquired when recording resumes visible (incl. after a system release)", () => {
  assert.equal(decideWakeLockAction({ phase: "recording", visible: false, held: true, supported: true }), "release");
  assert.equal(decideWakeLockAction({ phase: "recording", visible: true, held: false, supported: true }), "acquire");
  assert.equal(decideWakeLockAction({ phase: "recording", visible: true, held: true, supported: true }), "none");
});

test("wake lock: unsupported never attempts anything", () => {
  for (const phase of PHASES) assert.equal(decideWakeLockAction({ phase, visible: true, held: false, supported: false }), "none");
});

test("wake lock guidance: 'Recording protected' only when the lock is actually held while recording", () => {
  assert.equal(wakeLockGuidance({ status: "active", phase: "recording" }).title, "Recording protected");
  assert.equal(wakeLockGuidance({ status: "active", phase: "recording" }).tone, "protected");
  assert.notEqual(wakeLockGuidance({ status: "inactive", phase: "recording" }).title, "Recording protected");
  assert.notEqual(wakeLockGuidance({ status: "active", phase: "paused" }).title, "Recording protected");
});

test("wake lock guidance: unsupported or failed shows the stronger keep-awake warning", () => {
  for (const status of ["unsupported", "failed"] as const) {
    const g = wakeLockGuidance({ status, phase: "recording" });
    assert.equal(g.tone, "warning");
    assert.match(g.title, /Keep this screen awake/);
    assert.match(g.body, /isn't available on this device/);
  }
});

test("STATIC: Wake Lock is driven automatically by phase changes and visibility, never by a manual tap", () => {
  const code = codeOf("components/residents/assessment/CaptureScreen.tsx");
  assert.match(code, /const dispatch = useCallback\([\s\S]*?void syncWakeLock\(\)/);
  assert.match(code, /function onVisibility\(\) \{[\s\S]*?syncWakeLockRef\.current[\s\S]*?addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(code, /navigator\.wakeLock\.request\("screen"\)/);
  assert.match(code, /setWakeLockStatus\("failed"\)/);
});

// ─── interruption detection wiring ──────────────────────────────────────────────────────────

test("STATIC: every interruption signal is wired — hidden page, track ended, track muted, recorder error, unexpected stop", () => {
  const code = codeOf("components/residents/assessment/CaptureScreen.tsx");
  assert.match(code, /document\.hidden\)\s*\{\s*if \(phaseRef\.current === "recording"\) void interruptRef\.current\("page_hidden"/);
  assert.match(code, /track\.onended = \(\) => void interruptRef\.current\("track_ended"\)/);
  assert.match(code, /track\.onmute = \(\) => void interruptRef\.current\("track_muted"\)/);
  assert.match(code, /recorder\.onerror = \(\) => \{\s*void interruptRef\.current\("recorder_error"\)/);
  assert.match(code, /if \(!intentionalStopsRef\.current\.has\(recorder\)\) void interruptRef\.current\("recorder_stopped_unexpectedly"\)/);
});

test("STATIC: the elapsed timer interval is gated by timerShouldRun", () => {
  assert.match(codeOf("components/residents/assessment/CaptureScreen.tsx"), /if \(!timerShouldRun\(phase\)\) return;\s*const timer = setInterval/);
});

test("interruption messages are honest and always point to Resume", () => {
  for (const r of RUN_END_REASONS.filter((r) => r !== "stopped_for_finish")) {
    const m = interruptionMessage(r);
    assert.match(m, /Resume recording/);
    assert.match(m, /saved/);
  }
  assert.ok(!/continue(s|d)? recording in the background|still recording/i.test(RUN_END_REASONS.map(interruptionMessage).join(" ")));
});

// ─── resume / runs / indexes ────────────────────────────────────────────────────────────────

test("resume plan: same run only when the recorder is genuinely paused and the track healthy", () => {
  assert.equal(decideResumePlan({ recorderState: "paused", trackReadyState: "live", trackMuted: false }), "resume_same_run");
  assert.equal(decideResumePlan({ recorderState: "inactive", trackReadyState: "live", trackMuted: false }), "new_run_reuse_stream");
  assert.equal(decideResumePlan({ recorderState: null, trackReadyState: "live", trackMuted: false }), "new_run_reuse_stream");
});

test("resume plan: microphone is re-requested only when the existing track can't be used", () => {
  assert.equal(decideResumePlan({ recorderState: null, trackReadyState: "ended", trackMuted: false }), "new_run_new_stream");
  assert.equal(decideResumePlan({ recorderState: "paused", trackReadyState: "live", trackMuted: true }), "new_run_new_stream");
  assert.equal(decideResumePlan({ recorderState: null, trackReadyState: null, trackMuted: false }), "new_run_new_stream");
});

test("no duplicate assessment session: resuming after an interruption always reuses the existing session", () => {
  assert.equal(decideSessionForStart(true), "reuse_session");
  assert.equal(decideSessionForStart(false), "create_or_resume_session");
  const code = codeOf("components/residents/assessment/CaptureScreen.tsx");
  assert.match(code, /if \(decideSessionForStart\(Boolean\(sessionIdRef\.current\)\) === "create_or_resume_session"\) \{\s*const result = await startOrResumeNativeCapture/);
  assert.equal((code.match(/startOrResumeNativeCapture\(/g) ?? []).length, 1, "only one place may create/resume a session");
});

test("a new run after an interruption gets a new runId; reusing a runId is refused", () => {
  let log = openRun([], RUN_A, T0);
  log = closeOpenRun(log, T0 + 60_000, "page_hidden");
  log = openRun(log, RUN_B, T0 + 90_000);
  assert.deepEqual(log.map((r) => r.runId), [RUN_A, RUN_B]);
  assert.throws(() => openRun(log, RUN_A, T0 + 120_000));
});

test("chunk indexes stay monotonic across runs and reloads (run B continues after run A, never restarts at 0)", () => {
  const runAIndexes = [0, 1, 2, 3, 4, 5];
  let next = deriveNextChunkIndex([], runAIndexes);
  assert.equal(next, 6);
  // reload: server has 0..4 uploaded, device still holds 5 → still 6
  next = deriveNextChunkIndex([0, 1, 2, 3, 4], runAIndexes);
  assert.equal(next, 6);
  // run C after run B (6..8) on the server
  assert.equal(deriveNextChunkIndex([0, 1, 2, 3, 4, 5, 6, 7, 8], []), 9);
});

test("closeOpenRun closes only the open run and keeps an earlier run's first-recorded reason", () => {
  let log = openRun([], RUN_A, T0);
  log = closeOpenRun(log, T0 + 10_000, "track_muted");
  log = closeOpenRun(log, T0 + 20_000, "page_hidden"); // no open run: no change
  assert.equal(log[0].endReason, "track_muted");
  assert.equal(log[0].endedAt, T0 + 10_000);
});

// ─── interruption metadata ──────────────────────────────────────────────────────────────────

test("continuity: one run finished intentionally is continuous", () => {
  let log = openRun([], RUN_A, T0);
  log = closeOpenRun(log, T0 + 1_800_000, "stopped_for_finish");
  const s = summarizeContinuity(log, 1);
  assert.equal(s.continuity, "continuous");
  assert.equal(s.interruptionCount, 0);
  assert.equal(s.runCount, 1);
});

test("continuity: interruptions counted with reasons, timestamps, and measured gaps between runs", () => {
  let log = openRun([], RUN_A, T0);
  log = closeOpenRun(log, T0 + 60_000, "page_hidden");
  log = openRun(log, RUN_B, T0 + 75_000);
  log = closeOpenRun(log, T0 + 300_000, "track_muted");
  log = openRun(log, RUN_C, T0 + 420_000);
  log = closeOpenRun(log, T0 + 900_000, "stopped_for_finish");
  const s = summarizeContinuity(log, 3);
  assert.equal(s.continuity, "interrupted");
  assert.equal(s.runCount, 3);
  assert.equal(s.interruptionCount, 2);
  assert.deepEqual(s.interruptions.map((i) => [i.reason, i.at]), [
    ["page_hidden", T0 + 60_000],
    ["track_muted", T0 + 300_000],
  ]);
  assert.deepEqual(s.gapsBetweenRunsMs, [15_000, 120_000]);
});

test("continuity: stored runs this device never logged count as interruptions of unknown reason (not invented)", () => {
  let log = openRun([], RUN_B, T0);
  log = closeOpenRun(log, T0 + 1000, "stopped_for_finish");
  const s = summarizeContinuity(log, 2);
  assert.equal(s.continuity, "interrupted");
  assert.equal(s.interruptionCount, 1);
  assert.equal(s.interruptions.length, 0, "no reason is fabricated for the unlogged run");
});

test("reload: a run still open at load is closed as page_closed_or_reloaded at its last chunk's time (not 'now')", () => {
  const log: RunLogEntry[] = [{ runId: RUN_A, startedAt: T0, endedAt: null, endReason: null }];
  const closed = closeRunsOpenAtLoad(log, new Map([[RUN_A, T0 + 58_000]]));
  assert.deepEqual(closed[0], { runId: RUN_A, startedAt: T0, endedAt: T0 + 58_000, endReason: "page_closed_or_reloaded" });
  assert.equal(closeRunsOpenAtLoad(log, new Map())[0].endedAt, T0);
});

test("only stopped_for_finish is non-interruption", () => {
  for (const r of RUN_END_REASONS) assert.equal(isInterruptionReason(r), r !== "stopped_for_finish", r);
  assert.equal(isInterruptionReason(null), false);
});

test("sanitizeRunLog: untrusted input — malformed entries dropped, duplicate runIds dropped, unknown reasons → 'unknown'", () => {
  const out = sanitizeRunLog([
    { runId: RUN_A, startedAt: T0, endedAt: T0 + 5, endReason: "page_hidden" },
    { runId: RUN_A, startedAt: T0, endedAt: T0 + 5, endReason: "page_hidden" },
    { runId: "BAD!", startedAt: T0, endedAt: null, endReason: null },
    { runId: RUN_B, startedAt: "x", endedAt: null, endReason: null },
    { runId: RUN_C, startedAt: T0, endedAt: T0 + 9, endReason: "aliens" },
    null,
    "nope",
  ]);
  assert.deepEqual(out.map((r) => [r.runId, r.endReason]), [
    [RUN_A, "page_hidden"],
    [RUN_C, "unknown"],
  ]);
  assert.deepEqual(sanitizeRunLog("not an array"), []);
  assert.equal(sanitizeRunLog(Array.from({ length: 900 }, (_, i) => ({ runId: `r${String(i).padStart(10, "0")}`, startedAt: T0 })) ).length, 500);
});

test("sanitizeRunLog: an end time before the start is discarded rather than trusted", () => {
  assert.deepEqual(sanitizeRunLog([{ runId: RUN_A, startedAt: T0, endedAt: T0 - 1, endReason: "page_hidden" }])[0], {
    runId: RUN_A,
    startedAt: T0,
    endedAt: null,
    endReason: null,
  });
});

// ─── IndexedDB preservation / Finish ────────────────────────────────────────────────────────

test("local chunks + run log are cleared ONLY after the server confirms 'captured'", () => {
  assert.equal(shouldClearLocalCaptureData({ status: "captured" }), true);
  assert.equal(shouldClearLocalCaptureData({ error: "x" }), false);
  assert.equal(shouldClearLocalCaptureData({ status: "recording" }), false);
  const code = codeOf("components/residents/assessment/CaptureScreen.tsx");
  assert.equal((code.match(/deleteChunksForSession\(/g) ?? []).length, 1);
  assert.match(code, /if \(shouldClearLocalCaptureData\(result\)\) \{\s*await deleteChunksForSession\(sid\)[\s\S]*?await deleteRunsForSession\(sid\)/);
});

test("STATIC: IndexedDB chunks are add()-only (never overwritten); the v2 upgrade only adds the runs store", () => {
  const code = codeOf("lib/assessmentCapture/idb.ts");
  assert.match(code, /tx\.objectStore\(STORE\)\.add\(/);
  assert.ok(!/objectStore\(STORE\)\.put\(\{ \.\.\.record, state: "pending"/.test(code));
  assert.match(code, /const DB_VERSION = 2;/);
  assert.match(code, /if \(!db\.objectStoreNames\.contains\(STORE\)\)/);
  assert.match(code, /if \(!db\.objectStoreNames\.contains\(RUN_STORE\)\)/);
  assert.ok(!/deleteObjectStore/.test(code));
});

function stored(chunkIndex: number, runId: string, size = 100): StoredChunk {
  return { name: `${String(chunkIndex).padStart(6, "0")}_${runId}.webm`, chunkIndex, runId, extension: "webm", size, mimeType: "audio/webm", createdAt: null };
}

test("Finish after an interruption: multi-run audio finalizes to captured (never queued), and continuity marks it interrupted", () => {
  const manifest = [0, 1, 2].map((i) => ({ chunkIndex: i, runId: RUN_A, mimeType: "audio/webm", size: 100, recordedAt: T0 + i * 10_000 }))
    .concat([3, 4].map((i) => ({ chunkIndex: i, runId: RUN_B, mimeType: "audio/webm", size: 100, recordedAt: T0 + 90_000 + i * 10_000 })));
  const d = decideCaptureFinalize({
    sessionStatus: "recording",
    manifest,
    storedChunks: [stored(0, RUN_A), stored(1, RUN_A), stored(2, RUN_A), stored(3, RUN_B), stored(4, RUN_B)],
  });
  assert.equal(d.kind, "finalize");
  if (d.kind !== "finalize") return;
  assert.equal(d.nextStatus, "captured");
  assert.equal(d.summary.runCount, 2);
  let log = openRun([], RUN_A, T0);
  log = closeOpenRun(log, T0 + 30_000, "page_hidden");
  log = openRun(log, RUN_B, T0 + 120_000);
  log = closeOpenRun(log, T0 + 140_000, "stopped_for_finish");
  const c = summarizeContinuity(log, d.summary.runCount);
  assert.equal(c.continuity, "interrupted");
  assert.equal(c.interruptionCount, 1);
});

test("Finish after an interruption with NO resume: what exists is captured, and the run log still shows the interruption", () => {
  let log = openRun([], RUN_A, T0);
  log = closeOpenRun(log, T0 + 60_000, "page_hidden");
  log = closeOpenRun(log, T0 + 600_000, "stopped_for_finish"); // nothing open: reason preserved
  const c = summarizeContinuity(log, 1);
  assert.equal(c.continuity, "interrupted");
  assert.equal(c.interruptions[0].reason, "page_hidden");
});

test("STATIC: Finish sends the run log; the server sanitizes it and records continuity in source_payload (no schema change)", () => {
  assert.match(codeOf("components/residents/assessment/CaptureScreen.tsx"), /finishNativeCapture\(\{ residentId, assessmentSessionId: sid, manifest, runLog: runLogRef\.current \}\)/);
  const action = codeOf("lib/actions/nativeAssessmentCapture.ts");
  assert.match(action, /const runLog = sanitizeRunLog\(input\.runLog\);/);
  assert.match(action, /summarizeContinuity\(runLog, decision\.summary\.runCount\)/);
  const data = codeOf("lib/data/nativeAssessmentCapture.ts");
  for (const key of ["capture_continuity", "interruption_count", "interruptions", "gaps_between_runs_ms", "run_log"]) assert.match(data, new RegExp(`${key}:`));
});

test("STATIC: no resilience module writes or references a 'queued' status", () => {
  for (const f of ["lib/assessmentCapture/recordingHealth.ts", "components/residents/assessment/CaptureScreen.tsx", "lib/assessmentCapture/idb.ts"]) {
    assert.ok(!/["'`]queued["'`]/.test(codeOf(f)), f);
  }
});

let passed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
