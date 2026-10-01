import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { planAudioRuns, reconstructRun, mediaFormatForMime, hasContainerHeader } from "../transcription/audioRuns.ts";
import { parseTranscribeOutput, combineRunTranscripts, formatOffset, hasRecognizedSpeech, type ParsedRunTranscript } from "../transcription/transcriptFormat.ts";
import {
  decideTranscriptionStep,
  decideRetryRoute,
  initialTranscriptionState,
  jobNameFor,
  resetFailedRunsForRetry,
  stagingKeysFor,
  transcriptionDisplayState,
  MAX_RUN_ATTEMPTS,
  type TranscriptionState,
} from "../transcription/transcriptionState.ts";
import {
  advanceTranscription,
  retryTranscriptionCleanup,
  gapsFromCaptureRunLog,
  deletableCleanupItems,
  type TranscriptionBackend,
  type TranscriptionDeps,
  type TranscriptionStore,
  type CapturedAudioReader,
  type TranscribeJobStatus,
} from "../transcription/transcriptionOrchestrator.ts";
import { decideExtractionPolicy } from "../extractionPolicy.ts";
import { getExtractionProviderByKey } from "../providerSelection.ts";
import { decideAwsAssessmentAuthorization, awsTranscriptionDispatchScope } from "../../phiGovernance.ts";
import { resolveAssessmentPipelineAwsCredentials, resolveServeAwsCredentials } from "../../../ai/awsCredentials.ts";
import { isEligibleForDispatch } from "../../processingQueue.ts";
import type { StoredChunk } from "../../../assessmentCapture/captureLogic.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const codeOf = (rel: string) =>
  readFileSync(join(repoRoot, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SESSION = "6ed919e4-245e-4cbb-8809-ceaec5401da2";
const RUN_A = "a1b2c3d4e5f60718";
const RUN_B = "0f1e2d3c4b5a6978";
const SYNTH_ENV = { PHI_SYNTHETIC_TEST_MODE: "synthetic-only-not-for-production" };

// ─── fixtures ─────────────────────────────────────────────────────────────────────────────────

const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
function webmChunk(first: boolean, fill: number, len = 12): Uint8Array {
  const head = first ? EBML : CLUSTER;
  return Uint8Array.from([...head, ...Array.from({ length: len - 4 }, () => fill)]);
}
function name(index: number, runId: string, ext = "webm") {
  return `${String(index).padStart(6, "0")}_${runId}.${ext}`;
}
function stored(index: number, runId: string | null, size = 12, mimeType: string | null = "audio/webm;codecs=opus", ext = "webm"): StoredChunk {
  return { name: runId ? name(index, runId, ext) : `${index}.webm`, chunkIndex: index, runId, extension: ext, size, mimeType, createdAt: null };
}

function transcribeOutput(words: [string, number, string | null][], extra: Record<string, unknown> = {}) {
  return {
    results: {
      transcripts: [{ transcript: words.map((w) => w[0]).join(" ") }],
      items: words.map(([content, start, speaker]) =>
        content === "." || content === "?"
          ? { type: "punctuation", alternatives: [{ content }] }
          : { type: "pronunciation", start_time: String(start), end_time: String(start + 0.4), alternatives: [{ content }], ...(speaker ? { speaker_label: speaker } : {}) }
      ),
      ...extra,
    },
  };
}

// ─── in-memory fakes ──────────────────────────────────────────────────────────────────────────

interface World {
  session: { id: string; status: string; isSyntheticTest: boolean; claimedAt: string | null };
  source: { id: string; transcriptText: string | null; payload: Record<string, unknown> | null; metadata: unknown } | null;
  chunks: Map<string, Uint8Array>;
  storedChunks: StoredChunk[];
  log: string[];
  jobs: Map<string, { status: TranscribeJobStatus; outputKey: string; failureReason?: string }>;
  outputs: Map<string, unknown>;
  staged: Map<string, Uint8Array>;
  startCalls: string[];
  backendConstructed: number;
  failDeletes: boolean;
  failNextPut: boolean;
  t: number;
}

function makeWorld(runs: { runId: string; count: number }[], opts: { synthetic?: boolean } = {}): World {
  const chunks = new Map<string, Uint8Array>();
  const storedChunks: StoredChunk[] = [];
  let index = 0;
  for (const run of runs) {
    for (let i = 0; i < run.count; i++) {
      const bytes = webmChunk(i === 0, index + 1);
      chunks.set(name(index, run.runId), bytes);
      storedChunks.push(stored(index, run.runId, bytes.length));
      index++;
    }
  }
  return {
    session: { id: SESSION, status: "captured", isSyntheticTest: opts.synthetic ?? true, claimedAt: null },
    source: { id: "src-1", transcriptText: null, payload: { capture_origin: "serve_os_native_capture" }, metadata: null },
    chunks,
    storedChunks,
    log: [],
    jobs: new Map(),
    outputs: new Map(),
    staged: new Map(),
    startCalls: [],
    backendConstructed: 0,
    failDeletes: false,
    failNextPut: false,
    t: Date.parse("2026-10-01T15:00:00Z"),
  };
}

function storeFor(w: World): TranscriptionStore {
  return {
    async getSession() {
      return { id: w.session.id, status: w.session.status, isSyntheticTest: w.session.isSyntheticTest };
    },
    async claimLease(_id, token, staleBefore) {
      if (w.session.status !== "captured") return false;
      if (w.session.claimedAt && w.session.claimedAt >= staleBefore) return false;
      w.session.claimedAt = token;
      w.log.push("claim");
      return true;
    },
    async releaseLease(_id, token) {
      if (w.session.claimedAt === token) w.session.claimedAt = null;
    },
    async getNativeAudioSource() {
      return w.source ? { ...w.source } : null;
    },
    async saveState(_sourceId, state) {
      w.source!.metadata = JSON.parse(JSON.stringify(state));
      const runs = state.runs.map((r) => `${r.order}:${r.state}${r.jobName ? "@" + r.jobName.slice(-20) : ""}`).join(",");
      w.log.push(`save[${state.status}|${runs}]`);
    },
    async persistTranscript(_sourceId, text) {
      if (w.source!.transcriptText !== null) return false;
      w.source!.transcriptText = text;
      w.log.push("persistTranscript");
      return true;
    },
    async queueForExtraction() {
      if (w.session.status !== "captured") return false;
      w.session.status = "queued";
      w.log.push("queued");
      return true;
    },
    async failTranscription(_id, reason) {
      if (w.session.status !== "captured") return false;
      w.session.status = "failed";
      w.log.push(`failed:${reason}`);
      return true;
    },
  };
}

function audioFor(w: World): CapturedAudioReader {
  return {
    async listChunks() {
      return { chunks: w.storedChunks };
    },
    async download(_s, chunkName) {
      const b = w.chunks.get(chunkName);
      if (!b) throw new Error(`missing ${chunkName}`);
      return b;
    },
  };
}

function backendFor(w: World): TranscriptionBackend {
  return {
    async putStagingObject(key, body) {
      if (w.failNextPut) {
        w.failNextPut = false;
        throw new Error("simulated network failure");
      }
      w.staged.set(key, body);
      w.log.push(`put:${key.split("/").slice(-2).join("/")}`);
    },
    async startJob({ jobName, outputKey }) {
      w.startCalls.push(jobName);
      w.log.push(`start:${jobName.slice(-20)}`);
      if (w.jobs.has(jobName)) return "already_exists";
      w.jobs.set(jobName, { status: "IN_PROGRESS", outputKey });
      return "started";
    },
    async getJob(jobName) {
      const j = w.jobs.get(jobName);
      return j ? { status: j.status, failureReason: j.failureReason } : { status: "NOT_FOUND" };
    },
    async readOutput(outputKey) {
      const o = w.outputs.get(outputKey);
      if (!o) throw new Error("no output");
      return o;
    },
    async deleteStagingObject(key) {
      if (w.failDeletes) throw new Error("simulated S3 outage");
      w.staged.delete(key);
    },
    async deleteJob(jobName) {
      if (w.failDeletes) throw new Error("simulated Transcribe outage");
      w.jobs.delete(jobName);
    },
  };
}

function depsFor(w: World, env: Record<string, string | undefined> = SYNTH_ENV, overrides: Partial<TranscriptionDeps> = {}): TranscriptionDeps {
  return {
    store: storeFor(w),
    audio: audioFor(w),
    backend: () => {
      w.backendConstructed++;
      return backendFor(w);
    },
    authorize: (s) => decideAwsAssessmentAuthorization(s, env),
    now: () => w.t,
    sleep: async (ms) => {
      w.t += ms;
    },
    pollBudgetMs: 0,
    pollIntervalMs: 15_000,
    leaseMs: 16 * 60_000,
    ...overrides,
  };
}

/** Completes every IN_PROGRESS job with a fixture transcript. */
function completeJobs(w: World, wordsFor: (jobName: string) => [string, number, string | null][]) {
  for (const [jobName, job] of w.jobs) {
    if (job.status !== "IN_PROGRESS") continue;
    job.status = "COMPLETED";
    w.outputs.set(job.outputKey, transcribeOutput(wordsFor(jobName)));
  }
}

const state = (w: World) => w.source!.metadata as TranscriptionState;

// ─── runs: grouping, ordering, gaps, duplicates ───────────────────────────────────────────────

test("runs: chunks are grouped by runId and ordered deterministically regardless of listing order", () => {
  const shuffled = [stored(4, RUN_B), stored(1, RUN_A), stored(3, RUN_B), stored(0, RUN_A), stored(2, RUN_A)];
  const r = planAudioRuns(shuffled);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.runs.map((x) => [x.order, x.runId, x.chunkIndexes]), [
    [1, RUN_A, [0, 1, 2]],
    [2, RUN_B, [3, 4]],
  ]);
  assert.deepEqual(planAudioRuns([...shuffled].reverse()), r);
});

test("runs: duplicate chunk index, legacy objects, and overlapping runs fail closed", () => {
  assert.equal(planAudioRuns([stored(0, RUN_A), stored(0, RUN_B)]).ok, false);
  assert.equal(planAudioRuns([stored(0, null)]).ok, false);
  assert.equal(planAudioRuns([stored(0, RUN_A), stored(1, RUN_B), stored(2, RUN_A)]).ok, false);
  assert.equal(planAudioRuns([]).ok, false);
});

test("runs: gaps inside a run are reported (not repaired); gaps between runs are not internal", () => {
  const r = planAudioRuns([stored(0, RUN_A), stored(2, RUN_A), stored(5, RUN_B)]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.runs[0].internalGaps, [1]);
  assert.deepEqual(r.runs[1].internalGaps, []);
});

test("runs: mixed formats within one run fail closed; per-run format preserved across runs", () => {
  assert.equal(planAudioRuns([stored(0, RUN_A), stored(1, RUN_A, 12, "audio/mp4", "mp4")]).ok, false);
  const r = planAudioRuns([stored(0, RUN_A), stored(1, RUN_B, 12, "audio/mp4", "mp4")]);
  assert.ok(r.ok && r.runs[0].mediaFormat === "webm" && r.runs[1].mediaFormat === "mp4");
});

test("MIME → extension → AWS MediaFormat; AAC is refused (not a Transcribe input format)", () => {
  assert.deepEqual(mediaFormatForMime("audio/webm;codecs=opus"), { extension: "webm", mediaFormat: "webm" });
  assert.deepEqual(mediaFormatForMime("audio/mp4"), { extension: "mp4", mediaFormat: "mp4" });
  assert.deepEqual(mediaFormatForMime("audio/ogg"), { extension: "ogg", mediaFormat: "ogg" });
  assert.equal(mediaFormatForMime("audio/aac"), null);
  assert.equal(mediaFormatForMime("video/quicktime"), null);
  assert.equal(planAudioRuns([stored(0, RUN_A, 12, "audio/aac", "aac")]).ok, false);
});

// ─── reconstruction ───────────────────────────────────────────────────────────────────────────

test("WebM one run: first chunk carries the header; continuation chunks are byte-concatenated in order", () => {
  const a = webmChunk(true, 1);
  const b = webmChunk(false, 2);
  const c = webmChunk(false, 3);
  const r = reconstructRun({ runId: RUN_A, extension: "webm", chunkIndexes: [0, 1, 2] }, [a, b, c]);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([...r.bytes], [...a, ...b, ...c]);
});

test("WebM guards: missing header, or a second header mid-run (not one stream), fail closed", () => {
  assert.equal(reconstructRun({ runId: RUN_A, extension: "webm", chunkIndexes: [0] }, [webmChunk(false, 1)]).ok, false);
  assert.equal(reconstructRun({ runId: RUN_A, extension: "webm", chunkIndexes: [0, 1] }, [webmChunk(true, 1), webmChunk(true, 2)]).ok, false);
  assert.equal(reconstructRun({ runId: RUN_A, extension: "webm", chunkIndexes: [0, 1] }, [webmChunk(true, 1)]).ok, false);
});

test("MP4: a single self-contained chunk is accepted; multi-chunk MP4 is refused (not yet validated)", () => {
  const ftyp = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]);
  assert.equal(hasContainerHeader("mp4", ftyp), true);
  assert.equal(reconstructRun({ runId: RUN_A, extension: "mp4", chunkIndexes: [0] }, [ftyp]).ok, true);
  const multi = reconstructRun({ runId: RUN_A, extension: "mp4", chunkIndexes: [0, 1] }, [ftyp, Uint8Array.from([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x66])]);
  assert.equal(multi.ok, false);
  if (!multi.ok) assert.match(multi.reason, /not been validated/);
});

// ─── transcript parsing / combination ─────────────────────────────────────────────────────────

test("speaker labels: per-item labels become turns; punctuation attaches; no identity is invented", () => {
  const p = parseTranscribeOutput(transcribeOutput([["Hello", 0.5, "spk_0"], [".", 0, null], ["Hi", 1.5, "spk_1"], ["there", 1.9, "spk_1"], ["?", 0, null]]));
  assert.ok(!("error" in p));
  if ("error" in p) return;
  assert.deepEqual(p.turns.map((t) => [t.speaker, t.text]), [["spk_0", "Hello."], ["spk_1", "Hi there?"]]);
  assert.equal(p.speakerLabels, true);
  assert.equal(p.speakerCount, 2);
  const text = combineRunTranscripts([{ order: 1, transcript: p, internalGapCount: 0 }]);
  assert.ok(!/resident|daughter|assessor|spouse|POA/i.test(text.replace(/do not identify who is speaking/, "")));
});

test("speaker labels: older output format (speaker_labels.segments) is mapped by time", () => {
  const out = transcribeOutput([["Good", 1, null], ["morning", 1.5, null], ["Yes", 4, null]], {
    speaker_labels: { speakers: 2, segments: [{ speaker_label: "spk_0", start_time: "0.9", end_time: "2.0" }, { speaker_label: "spk_1", start_time: "3.9", end_time: "4.5" }] },
  });
  const p = parseTranscribeOutput(out);
  assert.ok(!("error" in p) && p.turns.map((t) => t.speaker).join() === "spk_0,spk_1");
});

test("no speaker labels → unlabeled text; no items → plain transcript; malformed → error", () => {
  const p = parseTranscribeOutput(transcribeOutput([["just", 0, null], ["words", 0.5, null]]));
  assert.ok(!("error" in p) && p.turns.length === 1 && p.turns[0].speaker === null && !p.speakerLabels);
  const plain = parseTranscribeOutput({ results: { transcripts: [{ transcript: "plain text" }] } });
  assert.ok(!("error" in plain) && plain.turns[0].text === "plain text");
  assert.ok("error" in parseTranscribeOutput({}));
});

test("timestamps: mm:ss under an hour, h:mm:ss above", () => {
  assert.equal(formatOffset(0), "00:00");
  assert.equal(formatOffset(83.7), "01:23");
  assert.equal(formatOffset(3725), "1:02:05");
});

function parsed(words: [string, number, string | null][]): ParsedRunTranscript {
  const p = parseTranscribeOutput(transcribeOutput(words));
  if ("error" in p) throw new Error(p.error);
  return p;
}

test("combination: deterministic, chronological by part order, with a neutral interruption boundary and measured gap", () => {
  const runs = [
    { order: 2, transcript: parsed([["Second", 2, "spk_1"]]), internalGapCount: 0 },
    { order: 1, transcript: parsed([["First", 1, "spk_0"]]), internalGapCount: 0 },
  ];
  const text = combineRunTranscripts(runs, [15_000]);
  assert.equal(text, combineRunTranscripts([...runs].reverse(), [15_000]), "input order must not matter");
  assert.ok(text.indexOf("First") < text.indexOf("Second"));
  assert.match(text, /\[Part 1 of 2\]/);
  assert.match(text, /\[Recording interrupted — about 15 seconds were not recorded before Part 2\.\]/);
  assert.match(text, /\[00:01 spk_0\] First/);
});

test("combination: unknown gap is stated as unknown, never estimated; single run has no part headers", () => {
  const two = combineRunTranscripts([
    { order: 1, transcript: parsed([["a", 0, null]]), internalGapCount: 0 },
    { order: 2, transcript: parsed([["b", 0, null]]), internalGapCount: 2 },
  ]);
  assert.match(two, /the length of the gap is not known/);
  assert.match(two, /2 short segments of audio in this part could not be saved/);
  const one = combineRunTranscripts([{ order: 1, transcript: parsed([["a", 0, null]]), internalGapCount: 0 }]);
  assert.ok(!/Part 1/.test(one) && !/interrupted/.test(one));
});

test("gaps between runs come from the capture client's run log when both ends are recorded", () => {
  const payload = {
    run_log: [
      { run_id: RUN_A, started_at: "2026-10-01T15:00:00.000Z", ended_at: "2026-10-01T15:10:00.000Z" },
      { run_id: RUN_B, started_at: "2026-10-01T15:10:45.000Z", ended_at: "2026-10-01T15:20:00.000Z" },
    ],
  };
  assert.deepEqual(gapsFromCaptureRunLog(payload, [RUN_A, RUN_B]), [45_000]);
  assert.deepEqual(gapsFromCaptureRunLog(null, [RUN_A, RUN_B]), [null]);
});

// ─── lifecycle: one run ───────────────────────────────────────────────────────────────────────

test("one run: job handle persisted BEFORE staging/start; IN_PROGRESS returns running; COMPLETED persists transcript THEN queues", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 3 }]);
  const r1 = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r1.outcome, "running");
  assert.equal(w.session.status, "captured", "never queued while transcription is incomplete");
  const iStarting = w.log.findIndex((l) => l.includes("1:starting@"));
  const iPut = w.log.findIndex((l) => l.startsWith("put:"));
  const iStart = w.log.findIndex((l) => l.startsWith("start:"));
  assert.ok(iStarting >= 0 && iStarting < iPut && iPut < iStart, w.log.join(" | "));
  assert.equal(w.startCalls.length, 1);
  // the staged input is exactly the run's chunks, byte-concatenated in order
  const staged = [...w.staged.values()][0];
  assert.deepEqual([...staged], [...webmChunk(true, 1), ...webmChunk(false, 2), ...webmChunk(false, 3)]);

  completeJobs(w, () => [["The", 1, "spk_0"], ["assessment", 1.4, "spk_0"]]);
  const r2 = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r2.outcome, "queued");
  assert.equal(w.session.status, "queued");
  assert.ok(w.log.indexOf("persistTranscript") < w.log.indexOf("queued"), "transcript must be durable before queued");
  assert.match(w.source!.transcriptText!, /\[00:01 spk_0\] The assessment/);
  assert.equal(w.startCalls.length, 1, "no duplicate job");
  assert.equal(state(w).status, "persisted");
  assert.equal(state(w).cleanup.status, "done");
  assert.equal(w.staged.size, 0, "temporary staging cleaned");
  assert.equal(w.chunks.size, 3, "canonical audio untouched");
});

test("bounded polling: within one invocation, polls until COMPLETED inside the budget, then queues", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 2 }]);
  let polls = 0;
  const deps = depsFor(w, SYNTH_ENV, {
    pollBudgetMs: 60_000,
    sleep: async (ms) => {
      w.t += ms;
      if (++polls === 2) completeJobs(w, () => [["ok", 0, "spk_0"]]);
    },
  });
  assert.equal((await advanceTranscription(deps, SESSION)).outcome, "queued");
  assert.equal(polls, 2);
});

test("bounded polling: never exceeds the budget — returns running and the next invocation resumes", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 2 }]);
  let slept = 0;
  const r = await advanceTranscription(depsFor(w, SYNTH_ENV, { pollBudgetMs: 45_000, sleep: async (ms) => { slept += ms; w.t += ms; } }), SESSION);
  assert.equal(r.outcome, "running");
  assert.ok(slept <= 45_000);
});

// ─── lifecycle: multiple runs ─────────────────────────────────────────────────────────────────

test("multi-run: one job per run, independent media per run, combined chronologically with a boundary", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 2 }, { runId: RUN_B, count: 2 }]);
  w.source!.payload = {
    capture_origin: "serve_os_native_capture",
    run_log: [
      { run_id: RUN_A, started_at: "2026-10-01T15:00:00.000Z", ended_at: "2026-10-01T15:00:20.000Z" },
      { run_id: RUN_B, started_at: "2026-10-01T15:01:00.000Z", ended_at: "2026-10-01T15:01:20.000Z" },
    ],
  };
  await advanceTranscription(depsFor(w), SESSION);
  assert.equal(w.startCalls.length, 2);
  assert.ok(w.startCalls[0].includes(RUN_A) && w.startCalls[1].includes(RUN_B));
  const stagedInputs = [...w.staged.entries()].filter(([k]) => k.endsWith(".webm")).map(([, v]) => v);
  assert.equal(stagedInputs.length, 2);
  for (const media of stagedInputs) assert.ok(hasContainerHeader("webm", media), "each run is its own container");

  completeJobs(w, (job) => (job.includes(RUN_A) ? [["part", 1, "spk_0"], ["one", 1.2, "spk_0"]] : [["part", 2, "spk_1"], ["two", 2.2, "spk_1"]]));
  assert.equal((await advanceTranscription(depsFor(w), SESSION)).outcome, "queued");
  const t = w.source!.transcriptText!;
  assert.ok(t.indexOf("part one") < t.indexOf("part two"));
  assert.match(t, /\[Recording interrupted — about 40 seconds were not recorded before Part 2\.\]/);
});

test("multi-run partial completion: run 1 done, run 2 still running → running; run 1's result kept", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }, { runId: RUN_B, count: 1 }]);
  await advanceTranscription(depsFor(w), SESSION);
  const jobA = w.startCalls[0];
  w.jobs.get(jobA)!.status = "COMPLETED";
  w.outputs.set(w.jobs.get(jobA)!.outputKey, transcribeOutput([["first", 0, "spk_0"]]));
  assert.equal((await advanceTranscription(depsFor(w), SESSION)).outcome, "running");
  assert.equal(w.session.status, "captured");
  assert.equal(state(w).runs[0].state, "completed");
  assert.equal(state(w).runs[1].state, "started");
  assert.equal(w.source!.transcriptText, null);
});

test("multi-run partial failure: one run FAILED → session failed, no transcript, completed run's result retained for retry", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }, { runId: RUN_B, count: 1 }]);
  await advanceTranscription(depsFor(w), SESSION);
  const [jobA, jobB] = w.startCalls;
  w.jobs.get(jobA)!.status = "COMPLETED";
  w.outputs.set(w.jobs.get(jobA)!.outputKey, transcribeOutput([["first", 0, "spk_0"]]));
  w.jobs.get(jobB)!.status = "FAILED";
  w.jobs.get(jobB)!.failureReason = "The media format provided does not match the detected media format.";
  const r = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r.outcome, "failed");
  assert.equal(w.session.status, "failed");
  assert.equal(w.source!.transcriptText, null, "never a partial transcript");
  assert.equal(state(w).runs[0].state, "completed");
  assert.ok(state(w).runs[0].result);

  const reset = resetFailedRunsForRetry(state(w), new Date(w.t).toISOString());
  assert.ok(reset.ok);
  if (!reset.ok) return;
  assert.equal(reset.state.runs[0].state, "completed", "completed run is not re-transcribed");
  assert.equal(reset.state.runs[1].state, "planned");
  assert.equal(reset.state.runs[1].attempt, 2);
  assert.notEqual(jobNameFor(SESSION, RUN_B, 2), jobNameFor(SESSION, RUN_B, 1));
});

test("retry exhaustion: a run that failed MAX_RUN_ATTEMPTS times is not retried again", () => {
  const s = initialTranscriptionState(SESSION, (planAudioRuns([stored(0, RUN_A)]) as { ok: true; runs: never[] }).runs, "x");
  const failed = { ...s, runs: s.runs.map((r) => ({ ...r, state: "failed" as const, attempt: MAX_RUN_ATTEMPTS })) };
  assert.equal(resetFailedRunsForRetry(failed, "y").ok, false);
});

// ─── resume / duplicate prevention / timeouts ─────────────────────────────────────────────────

test("resume: a worker that died after persisting the handle but before starting → next invocation stages and starts exactly once", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 2 }]);
  w.failNextPut = true; // dies at staging, after the 'starting' handle was saved
  const r1 = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r1.outcome, "running");
  assert.equal(state(w).runs[0].state, "starting");
  assert.equal(w.startCalls.length, 0);
  await advanceTranscription(depsFor(w), SESSION);
  assert.equal(w.startCalls.length, 1);
  assert.equal(state(w).runs[0].state, "started");
});

test("resume: a worker that died after StartTranscriptionJob but before recording 'started' → adopts the existing job, no second start", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }]);
  await advanceTranscription(depsFor(w), SESSION);
  // simulate the crash window: state still says 'starting' although the job exists
  const s = state(w);
  w.source!.metadata = { ...s, runs: s.runs.map((r) => ({ ...r, state: "starting" })) };
  await advanceTranscription(depsFor(w), SESSION);
  assert.equal(w.startCalls.length, 1, "existing job adopted, never duplicated");
  assert.equal(state(w).runs[0].state, "started");
});

test("duplicate invocation: while a lease is held, a second worker is 'busy' and touches nothing", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }]);
  w.session.claimedAt = new Date(w.t - 60_000).toISOString();
  const r = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r.outcome, "busy");
  assert.equal(w.backendConstructed, 0);
  assert.equal(w.source!.metadata, null);
});

test("stale lease (worker killed by the platform): recovered after the lease window, resuming from persisted state", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }]);
  await advanceTranscription(depsFor(w), SESSION);
  w.session.claimedAt = new Date(w.t - 17 * 60_000).toISOString(); // dead worker's lease
  const r = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r.outcome, "running");
  assert.equal(w.startCalls.length, 1);
});

test("a vanished job (NOT_FOUND after 'started') is restarted under the same name — nothing exists to duplicate", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }]);
  await advanceTranscription(depsFor(w), SESSION);
  w.jobs.clear();
  await advanceTranscription(depsFor(w), SESSION);
  assert.equal(w.startCalls.length, 2);
  assert.equal(w.startCalls[0], w.startCalls[1]);
  assert.equal(w.jobs.size, 1);
});

test("repeated unexpected errors fail visibly after 3 consecutive invocations instead of looping forever", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }]);
  const deps = depsFor(w);
  const broken = { ...deps, backend: () => ({ ...backendFor(w), getJob: async () => { throw new Error("ThrottlingException"); }, putStagingObject: async () => { throw new Error("ThrottlingException"); } }) };
  const outcomes = [];
  for (let i = 0; i < 4; i++) outcomes.push((await advanceTranscription(broken, SESSION)).outcome);
  assert.deepEqual(outcomes.slice(0, 2), ["running", "running"]);
  assert.equal(outcomes[2], "failed");
  assert.equal(w.session.status, "failed");
});

// ─── no empty transcript / no empty draft ─────────────────────────────────────────────────────

test("no recognized speech → failed, no transcript persisted, never queued (no empty draft)", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }]);
  await advanceTranscription(depsFor(w), SESSION);
  for (const job of w.jobs.values()) {
    job.status = "COMPLETED";
    w.outputs.set(job.outputKey, { results: { transcripts: [{ transcript: "" }], items: [] } });
  }
  const r = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r.outcome, "failed");
  assert.equal(w.source!.transcriptText, null);
  assert.equal(w.session.status, "failed");
  assert.equal(hasRecognizedSpeech([{ transcript: { turns: [], speakerLabels: false, speakerCount: 0, durationSec: null } }]), false);
});

test("a transcript already persisted (died before queueing) → queued without re-transcribing", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }]);
  w.source!.transcriptText = "[00:00 spk_0] already here";
  const r = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r.outcome, "queued");
  assert.equal(w.startCalls.length, 0);
});

test("extraction policy: an empty transcript is never extracted, for any source", () => {
  for (const audioDerived of [true, false]) {
    const d = decideExtractionPolicy({ transcriptText: "   ", audioDerived, configuredProvider: "bedrock", awsAuthorization: { allowed: true, basis: "phi_attested" } });
    assert.equal(d.ok, false);
  }
});

// ─── cleanup ──────────────────────────────────────────────────────────────────────────────────

test("cleanup failure after persistence never affects the transcript or queueing; a later retry completes it idempotently", async () => {
  const w = makeWorld([{ runId: RUN_A, count: 1 }]);
  await advanceTranscription(depsFor(w), SESSION);
  completeJobs(w, () => [["words", 0, "spk_0"]]);
  w.failDeletes = true;
  const r = await advanceTranscription(depsFor(w), SESSION);
  assert.equal(r.outcome, "queued");
  assert.ok(w.source!.transcriptText);
  assert.equal(state(w).cleanup.status, "pending");
  assert.ok(state(w).cleanup.lastError);

  w.failDeletes = false;
  assert.equal(await retryTranscriptionCleanup(depsFor(w), SESSION), "cleaned");
  assert.equal(state(w).cleanup.status, "done");
  assert.equal(w.staged.size, 0);
  assert.equal(await retryTranscriptionCleanup(depsFor(w), SESSION), "nothing_to_do", "idempotent");
  assert.ok(w.source!.transcriptText, "transcript untouched by cleanup");
  assert.equal(w.chunks.size, 1, "canonical audio untouched by cleanup");
});

test("cleanup never deletes artifacts of a run attempt that is still being transcribed", () => {
  const s = initialTranscriptionState(SESSION, (planAudioRuns([stored(0, RUN_A)]) as { ok: true; runs: never[] }).runs, "x");
  const running: TranscriptionState = {
    ...s,
    runs: s.runs.map((r) => ({ ...r, state: "started" as const, attempt: 2 })),
    cleanup: {
      status: "pending",
      attempts: 0,
      lastError: null,
      items: [
        { runId: RUN_A, attempt: 1, jobName: "old", inputKey: "i1", outputKey: "o1", done: false },
        { runId: RUN_A, attempt: 2, jobName: "live", inputKey: "i2", outputKey: "o2", done: false },
      ],
    },
  };
  assert.deepEqual(deletableCleanupItems(running).map((i) => i.jobName), ["old"]);
});

test("IAM scope: every Transcribe job name the pipeline starts matches ServeAssessmentAWSPipelinePolicy's serve-assessment-* resource", async () => {
  const iamGlob = /^serve-assessment-/;
  const w = makeWorld([{ runId: RUN_A, count: 1 }, { runId: RUN_B, count: 1 }]);
  await advanceTranscription(depsFor(w), SESSION);
  assert.equal(w.startCalls.length, 2);
  for (const job of w.startCalls) assert.match(job, iamGlob);
  for (const item of state(w).cleanup.items) assert.match(item.jobName, iamGlob, "cleanup must target in-scope jobs");
  assert.match(state(w).batchId, iamGlob);
  // worst case (32-char run id, high attempt) still fits AWS's 200-char limit untruncated
  const longest = jobNameFor(SESSION, "z".repeat(32), MAX_RUN_ATTEMPTS);
  assert.ok(longest.length < 200 && longest.endsWith(`-a${MAX_RUN_ATTEMPTS}`));
  assert.ok(!/serve-asmt/.test(codeOf("lib/assessmentIntelligence/backgroundCore/transcription/transcriptionState.ts")));
});

test("deterministic AWS names: job name and staging keys depend only on (session, run, attempt)", () => {
  assert.equal(jobNameFor(SESSION, RUN_A, 1), `serve-assessment-${SESSION}-${RUN_A}-a1`);
  assert.match(jobNameFor(SESSION, RUN_A, 1), /^[0-9a-zA-Z._-]{1,200}$/);
  assert.deepEqual(stagingKeysFor(SESSION, RUN_A, 1, "webm"), {
    inputKey: `transcribe-staging/${SESSION}/${RUN_A}/a1/input.webm`,
    outputKey: `transcribe-staging/${SESSION}/${RUN_A}/a1/output.json`,
  });
});

// ─── PHI gate / synthetic authorization ───────────────────────────────────────────────────────

test("AWS PHI gate: a real session is blocked without the attestation — nothing claimed, no AWS client constructed", async () => {
  for (const env of [{}, SYNTH_ENV, { PHI_AWS_PROCESSING_CONFIRMED: "yes" }]) {
    const w = makeWorld([{ runId: RUN_A, count: 1 }], { synthetic: false });
    const r = await advanceTranscription(depsFor(w, env), SESSION);
    assert.equal(r.outcome, "blocked", JSON.stringify(env));
    assert.equal(w.backendConstructed, 0);
    assert.equal(w.session.claimedAt, null);
    assert.equal(w.source!.metadata, null);
    assert.equal(w.session.status, "captured");
  }
});

test("AWS PHI gate: synthetic needs BOTH the session flag AND the deployment's synthetic mode", () => {
  assert.equal(decideAwsAssessmentAuthorization({ isSyntheticTest: true }, {}).allowed, false);
  assert.equal(decideAwsAssessmentAuthorization({ isSyntheticTest: false }, SYNTH_ENV).allowed, false);
  assert.equal(decideAwsAssessmentAuthorization({ isSyntheticTest: true }, { PHI_SYNTHETIC_TEST_MODE: "true" }).allowed, false);
  assert.deepEqual(decideAwsAssessmentAuthorization({ isSyntheticTest: true }, SYNTH_ENV), { allowed: true, basis: "synthetic_test" });
  assert.deepEqual(decideAwsAssessmentAuthorization({ isSyntheticTest: false }, { PHI_AWS_PROCESSING_CONFIRMED: "true" }), { allowed: true, basis: "phi_attested" });
});

test("dispatch scope: nothing dispatched without authorization; only synthetic sessions in synthetic mode; all once attested", () => {
  assert.equal(awsTranscriptionDispatchScope({}), "none");
  assert.equal(awsTranscriptionDispatchScope(SYNTH_ENV), "synthetic_only");
  assert.equal(awsTranscriptionDispatchScope({ PHI_AWS_PROCESSING_CONFIRMED: "true" }), "all_captured");
});

// ─── provider safety ──────────────────────────────────────────────────────────────────────────

const attested = { allowed: true as const, basis: "synthetic_test" as const };

test("audio-derived extraction can never silently default to OpenAI", () => {
  const base = { transcriptText: "words", audioDerived: true, awsAuthorization: attested };
  assert.equal(decideExtractionPolicy({ ...base, configuredProvider: undefined }).ok, false, "unset → fail closed");
  assert.equal(decideExtractionPolicy({ ...base, configuredProvider: "" }).ok, false);
  assert.equal(decideExtractionPolicy({ ...base, configuredProvider: "openai" }).ok, false, "even explicit openai is refused for recorded audio");
  assert.deepEqual(decideExtractionPolicy({ ...base, configuredProvider: "bedrock" }), { ok: true, providerKey: "bedrock" });
});

test("audio-derived extraction of a real session without the AWS PHI attestation fails closed", () => {
  const d = decideExtractionPolicy({ transcriptText: "words", audioDerived: true, configuredProvider: "bedrock", awsAuthorization: decideAwsAssessmentAuthorization({ isSyntheticTest: false }, {}) });
  assert.equal(d.ok, false);
});

test("boundary: the pasted-transcript path keeps its existing provider behavior (documented, unchanged)", () => {
  const d = decideExtractionPolicy({ transcriptText: "words", audioDerived: false, configuredProvider: undefined, awsAuthorization: { allowed: false, reason: "x" } });
  assert.deepEqual(d, { ok: true, providerKey: "openai" });
});

test("Bedrock provider path: the policy's key resolves to the Bedrock provider; unknown keys throw", () => {
  assert.equal(getExtractionProviderByKey("bedrock").providerId, "bedrock-claude");
  assert.throws(() => getExtractionProviderByKey("nope"));
});

test("STATIC: the queued worker applies the extraction policy BEFORE any provider call, and passes the chosen provider", () => {
  const code = codeOf("lib/assessmentIntelligence/backgroundCore/processingCore.ts");
  const i = code.indexOf("decideExtractionPolicy(");
  const j = code.indexOf("runExtractionPipelineForSession(assessmentSessionId, session.resident_id, sourceId ?? \"\", getExtractionProviderByKey(policy.providerKey))");
  assert.ok(i > 0 && j > i);
});

test("AWS credentials (assessment pipeline): explicit keys required — no ambient/default chain unless a local developer opts in", () => {
  assert.throws(() => resolveAssessmentPipelineAwsCredentials({}), /must both be set/);
  assert.equal(resolveAssessmentPipelineAwsCredentials({ SERVE_AWS_ALLOW_DEFAULT_CREDENTIAL_CHAIN: "true" }), undefined);
  assert.deepEqual(resolveAssessmentPipelineAwsCredentials({ SERVE_AWS_ACCESS_KEY_ID: "AKIAFAKE", SERVE_AWS_SECRET_ACCESS_KEY: "s3cr3t" }), { accessKeyId: "AKIAFAKE", secretAccessKey: "s3cr3t" });
  let message = "";
  try {
    resolveAssessmentPipelineAwsCredentials({ SERVE_AWS_ACCESS_KEY_ID: "AKIAFAKE" });
  } catch (err) {
    message = (err as Error).message;
  }
  assert.match(message, /SERVE_AWS_SECRET_ACCESS_KEY/);
  assert.ok(!message.includes("AKIAFAKE"), "never leaks a credential value");
  assert.equal(resolveServeAwsCredentials({ allowDefaultChain: true }, {}), undefined, "Ask Serve's lenient mode unchanged");
});

// ─── routing / retry / queue ──────────────────────────────────────────────────────────────────

test("retry routing: failed during transcription → back to transcription; transcript present → extraction", () => {
  assert.equal(decideRetryRoute({ hasNativeAudioSource: true, transcriptPersisted: false }), "transcription");
  assert.equal(decideRetryRoute({ hasNativeAudioSource: true, transcriptPersisted: true }), "extraction");
  assert.equal(decideRetryRoute({ hasNativeAudioSource: false, transcriptPersisted: false }), "extraction");
});

test("the existing queue still cannot claim 'captured'; the worker routes captured → transcription, queued → extraction", () => {
  assert.equal(isEligibleForDispatch({ status: "captured", processingAttemptCount: 0, processingClaimedAt: null }), false);
  const code = codeOf("lib/assessmentIntelligence/backgroundCore/processingCore.ts");
  assert.match(code, /if \(session\.status === "captured"\) \{\s*const t = await advanceCapturedAssessmentTranscription\(assessmentSessionId\);\s*if \(t\.outcome !== "queued"\)/);
  const worker = codeOf("netlify/functions/assessment-processing-stage-worker-background.mts");
  assert.match(worker, /await advanceAssessmentSession\(assessmentSessionId\)/);
});

test("STATIC: transcription moves a session to 'queued' in exactly one place, conditional on 'captured'", () => {
  const store = codeOf("lib/assessmentIntelligence/backgroundCore/transcription/transcriptionStore.ts");
  assert.equal((store.match(/status: QUEUED_STATUS/g) ?? []).length, 1);
  assert.match(store, /update\(\{ status: QUEUED_STATUS \}\)\s*\.eq\("id", sessionId\)\s*\.eq\("status", CAPTURED_SESSION_STATUS\)/);
  const orchestrator = codeOf("lib/assessmentIntelligence/backgroundCore/transcription/transcriptionOrchestrator.ts");
  assert.ok(!/["'`]queued["'`]\s*\)/.test(orchestrator.replace(/outcome: "queued"/g, "")), "orchestrator only signals outcome 'queued'");
});

test("STATIC: canonical Supabase audio is only ever read by transcription (no remove/upload on intake-audio)", () => {
  const store = codeOf("lib/assessmentIntelligence/backgroundCore/transcription/transcriptionStore.ts");
  assert.ok(!/storage\.from\(INTAKE_AUDIO_BUCKET\)\.(remove|upload|move|update)/.test(store));
});

test("step decision: starts runs in order, then checks, combines only when all completed", () => {
  const plan = planAudioRuns([stored(0, RUN_A), stored(1, RUN_B)]);
  if (!plan.ok) throw new Error();
  let s = initialTranscriptionState(SESSION, plan.runs, "x");
  assert.deepEqual(decideTranscriptionStep(s), { kind: "start_run", runId: RUN_A });
  s = { ...s, runs: s.runs.map((r) => ({ ...r, state: "started" as const })) };
  assert.deepEqual(decideTranscriptionStep(s), { kind: "check_runs", runIds: [RUN_A, RUN_B] });
  s = { ...s, runs: s.runs.map((r) => ({ ...r, state: "completed" as const })) };
  assert.deepEqual(decideTranscriptionStep(s), { kind: "combine" });
});

test("display state for operators: awaiting / transcribing / failed / transcribed", () => {
  const plan = planAudioRuns([stored(0, RUN_A)]);
  if (!plan.ok) throw new Error();
  const s = initialTranscriptionState(SESSION, plan.runs, "x");
  assert.equal(transcriptionDisplayState({ state: null, transcriptPersisted: false }), "awaiting");
  assert.equal(transcriptionDisplayState({ state: s, transcriptPersisted: false }), "transcribing");
  assert.equal(transcriptionDisplayState({ state: { ...s, status: "failed" }, transcriptPersisted: false }), "failed");
  assert.equal(transcriptionDisplayState({ state: s, transcriptPersisted: true }), "transcribed");
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
