import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CAPTURED_SESSION_STATUS,
  ASSESSMENT_SESSION_STATUS_LABELS,
  nativeCaptureHref,
  decideSyntheticTestMarking,
  assessmentSessionDisplayLabel,
  assessmentSessionStatusLabel,
  normalizeMimeType,
  mimeTypeToExtension,
  pickRecorderMimeType,
  buildChunkObjectPath,
  parseChunkObjectName,
  parseStoredChunks,
  analyzeChunkIndexes,
  deriveNextChunkIndex,
  decideCaptureSessionResume,
  decideChunkUpload,
  decideCaptureFinalize,
  decideCaptureAccess,
  summarizeStoredChunks,
  microphoneErrorMessage,
  capturedAssessmentNotice,
  isCapturedTranscriptionEnabled,
  refineCapturedDisplayStates,
  CAPTURED_TRANSCRIPTION_NOT_ENABLED_LABEL,
  type StoredChunk,
  type FinalizeManifestEntry,
} from "../captureLogic.ts";
import { isEligibleForDispatch, isStaleProcessing, decideRetryEligibility } from "../../assessmentIntelligence/processingQueue.ts";
import { isReviewReadyStatus } from "../../assessmentIntelligence/currentAssessmentSelection.ts";
import { canCaptureResidentAssessment, canInspectCapturedAssessmentAudio } from "../../auth/permissions.ts";
import { AUTH_ROLES } from "../../auth/constants.ts";
import { decideAwsAssessmentAuthorization, awsTranscriptionDispatchScope, isAwsPhiProcessingConfirmed } from "../../assessmentIntelligence/phiGovernance.ts";

// Serve's assessor roles — an intentional product authorization decision (office_staff excluded).
const ASSESSOR_ROLES = ["admin", "manager", "executive", "operations"] as const;
import { decideExtractionPolicy } from "../../assessmentIntelligence/backgroundCore/extractionPolicy.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const SESSION = "6ed919e4-245e-4cbb-8809-ceaec5401da2";
const RESIDENT = "11111111-2222-4333-8444-555555555555";
const RUN_A = "a1b2c3d4e5f60718";
const RUN_B = "0f1e2d3c4b5a6978";

function stored(chunkIndex: number, runId: string | null, size: number | null = 100, mimeType: string | null = "audio/webm"): StoredChunk {
  const ext = runId ? "webm" : "webm";
  const name = runId ? `${String(chunkIndex).padStart(6, "0")}_${runId}.${ext}` : `${chunkIndex}.webm`;
  return { name, chunkIndex, runId, extension: ext, size, mimeType, createdAt: "2026-09-30T12:00:00Z" };
}

function entry(chunkIndex: number, runId = RUN_A, size = 100, mimeType = "audio/webm;codecs=opus"): FinalizeManifestEntry {
  return { chunkIndex, runId, size, mimeType, recordedAt: 1_700_000_000_000 + chunkIndex * 10_000 };
}

// ─── captured status semantics / queue invisibility ─────────────────────────────────────────

test("captured is not eligible for dispatch (the existing queue only selects 'queued')", () => {
  assert.equal(isEligibleForDispatch({ status: CAPTURED_SESSION_STATUS, processingAttemptCount: 0, processingClaimedAt: null }), false);
});

test("captured is never treated as stale processing (stale recovery only considers 'processing')", () => {
  assert.equal(
    isStaleProcessing({ status: CAPTURED_SESSION_STATUS, processingAttemptCount: 0, processingClaimedAt: "2020-01-01T00:00:00Z" }, Date.now()),
    false
  );
});

test("captured is not retry-eligible (Retry only requeues 'failed')", () => {
  assert.equal(decideRetryEligibility({ status: CAPTURED_SESSION_STATUS, processingAttemptCount: 0, processingClaimedAt: null }).allowed, false);
});

test("captured is not review-ready (never selected as a pending/current assessment to review)", () => {
  assert.equal(isReviewReadyStatus(CAPTURED_SESSION_STATUS), false);
});

test("STATIC: existing queue selection, claim, and stale recovery still key on queued/processing only", () => {
  const data = read("lib/data/assessmentIntelligence.ts");
  const dispatch = /getQueuedSessionsForDispatch[\s\S]*?\.eq\("status", "([a-z_]+)"\)/.exec(data);
  assert.equal(dispatch?.[1], "queued");
  const recover = /recoverStaleProcessingSessions[\s\S]*?\.eq\("status", "([a-z_]+)"\)/.exec(data);
  assert.equal(recover?.[1], "processing");
  const core = read("lib/assessmentIntelligence/backgroundCore/dataAccess.ts");
  const claim = /claimSessionForProcessing[\s\S]*?\.eq\("status", "([a-z_]+)"\)/.exec(core);
  assert.equal(claim?.[1], "queued");
  // The extraction queue's selection/claim/recovery functions never select 'captured'. (Admin
  // diagnostics may READ captured sessions — that's display, not queue selection.)
  const body = (src: string, fn: string) => src.split(`export async function ${fn}`)[1]?.split("export ")[0] ?? "";
  for (const [src, fn] of [
    [data, "getQueuedSessionsForDispatch"],
    [data, "recoverStaleProcessingSessions"],
    [core, "claimSessionForProcessing"],
  ] as const) {
    assert.ok(body(src, fn).length > 0, fn);
    assert.ok(!body(src, fn).includes('"captured"'), `${fn} must not select captured`);
  }
});

test("STATIC: no native-capture module can write status 'queued'", () => {
  for (const file of [
    "lib/assessmentCapture/captureLogic.ts",
    "lib/data/nativeAssessmentCapture.ts",
    "lib/actions/nativeAssessmentCapture.ts",
    "components/residents/assessment/CaptureScreen.tsx",
  ]) {
    // Comments explaining why 'queued' is never written are fine; code is what's checked.
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    // Reading/comparing a status (e.g. labels) is fine; WRITING 'queued' is what's forbidden.
    assert.ok(!/status\s*:\s*["'`]queued["'`]/.test(code), `${file} must not write status 'queued'`);
    assert.ok(!/(updateAssessmentSessionStatus|queueForExtraction)\s*\(/.test(code), `${file} must not move a session to the queue`);
  }
});

test("STATIC: the migration widens the status check to exactly the ten statuses, preserving all nine prior ones", () => {
  const sql = read("supabase/migrations/20260930000000_add_captured_assessment_session_status.sql");
  const match = /check \(status in \(([^)]*)\)\)/.exec(sql);
  assert.ok(match, "status check not found");
  const statuses = match![1].split(",").map((s) => s.trim().replace(/'/g, ""));
  const prior = ["recording", "queued", "processing", "failed", "draft", "needs_review", "approved", "amended", "operationalized"];
  for (const p of prior) assert.ok(statuses.includes(p), `missing prior status ${p}`);
  assert.deepEqual([...statuses].sort(), [...prior, "captured"].sort());
  assert.ok(!/\b(delete|update|drop column|drop table|truncate)\b/i.test(sql.replace(/--.*$/gm, "")), "migration must be additive only");
});

// ─── status labels ──────────────────────────────────────────────────────────────────────────

test("status label: captured reads as operator-friendly, with no queue/AWS terminology", () => {
  const label = assessmentSessionStatusLabel("captured");
  assert.equal(label, "Audio captured — awaiting transcription");
  assert.ok(!/queue|aws|transcribe job|s3/i.test(label));
});

test("status label: every existing status keeps its label; unknown falls back to the raw value", () => {
  assert.equal(ASSESSMENT_SESSION_STATUS_LABELS.queued, "Queued");
  assert.equal(ASSESSMENT_SESSION_STATUS_LABELS.draft, "Draft — needs review");
  assert.equal(ASSESSMENT_SESSION_STATUS_LABELS.needs_review, "Needs review");
  assert.equal(assessmentSessionStatusLabel("something_new"), "something_new");
});

// ─── MIME → extension ───────────────────────────────────────────────────────────────────────

test("MIME: parameters stripped and lower-cased", () => {
  assert.equal(normalizeMimeType("Audio/WebM; codecs=opus"), "audio/webm");
  assert.equal(normalizeMimeType(""), null);
  assert.equal(normalizeMimeType(null), null);
});

test("MIME: real container extensions (iOS audio/mp4 is NOT labelled webm)", () => {
  assert.equal(mimeTypeToExtension("audio/webm;codecs=opus"), "webm");
  assert.equal(mimeTypeToExtension("audio/mp4"), "mp4");
  assert.equal(mimeTypeToExtension("audio/mp4;codecs=mp4a.40.2"), "mp4");
  assert.equal(mimeTypeToExtension("audio/ogg"), "ogg");
  assert.equal(mimeTypeToExtension("audio/aac"), "aac");
});

test("MIME: unknown/unsupported types are refused, never guessed", () => {
  assert.equal(mimeTypeToExtension("video/quicktime"), null);
  assert.equal(mimeTypeToExtension("application/octet-stream"), null);
  assert.equal(mimeTypeToExtension(undefined), null);
});

test("recorder MIME preference: first supported candidate; empty when none or unavailable", () => {
  assert.equal(pickRecorderMimeType((t) => t === "audio/mp4"), "audio/mp4");
  assert.equal(pickRecorderMimeType((t) => t.startsWith("audio/webm")), "audio/webm;codecs=opus");
  assert.equal(pickRecorderMimeType(() => false), "");
  assert.equal(pickRecorderMimeType(null), "");
  assert.equal(pickRecorderMimeType(() => { throw new Error("boom"); }), "");
});

// ─── object paths ───────────────────────────────────────────────────────────────────────────

test("path: {session}/{index:6}_{run}.{ext}, no resident identity", () => {
  assert.equal(buildChunkObjectPath({ sessionId: SESSION, chunkIndex: 7, runId: RUN_A, mimeType: "audio/mp4" }), `${SESSION}/000007_${RUN_A}.mp4`);
});

test("path: invalid session/index/run/mime all throw rather than produce an unsafe path", () => {
  assert.throws(() => buildChunkObjectPath({ sessionId: "../etc", chunkIndex: 0, runId: RUN_A, mimeType: "audio/webm" }));
  assert.throws(() => buildChunkObjectPath({ sessionId: SESSION, chunkIndex: -1, runId: RUN_A, mimeType: "audio/webm" }));
  assert.throws(() => buildChunkObjectPath({ sessionId: SESSION, chunkIndex: 1.5, runId: RUN_A, mimeType: "audio/webm" }));
  assert.throws(() => buildChunkObjectPath({ sessionId: SESSION, chunkIndex: 0, runId: "BAD/RUN", mimeType: "audio/webm" }));
  assert.throws(() => buildChunkObjectPath({ sessionId: SESSION, chunkIndex: 0, runId: RUN_A, mimeType: "text/plain" }));
});

test("path round-trips through parseChunkObjectName; legacy {index}.webm parses with null run", () => {
  const name = buildChunkObjectPath({ sessionId: SESSION, chunkIndex: 12, runId: RUN_B, mimeType: "audio/webm" }).split("/")[1];
  assert.deepEqual(parseChunkObjectName(name), { chunkIndex: 12, runId: RUN_B, extension: "webm" });
  assert.deepEqual(parseChunkObjectName("000003.webm"), { chunkIndex: 3, runId: null, extension: "webm" });
  assert.equal(parseChunkObjectName(".emptyFolderPlaceholder"), null);
});

test("parseStoredChunks sorts by index and reports unrecognized objects separately", () => {
  const { chunks, unrecognized } = parseStoredChunks([
    { name: `000002_${RUN_A}.webm`, size: 10, mimeType: "audio/webm", createdAt: null },
    { name: "notes.txt", size: 1, mimeType: "text/plain", createdAt: null },
    { name: `000000_${RUN_A}.webm`, size: 10, mimeType: "audio/webm", createdAt: null },
  ]);
  assert.deepEqual(chunks.map((c) => c.chunkIndex), [0, 2]);
  assert.deepEqual(unrecognized, ["notes.txt"]);
});

// ─── indexing across runs / reloads, gaps & duplicates ──────────────────────────────────────

test("next index: 0 for a fresh session", () => {
  assert.equal(deriveNextChunkIndex([], []), 0);
});

test("next index: continues after the server's highest index (reload on another page load)", () => {
  assert.equal(deriveNextChunkIndex([0, 1, 2, 3]), 4);
});

test("next index: local not-yet-uploaded chunks win over a lagging server (reload before upload finished)", () => {
  assert.equal(deriveNextChunkIndex([0, 1], [0, 1, 2, 3, 4]), 5);
});

test("next index: never reuses an index even across gaps and multiple runs", () => {
  assert.equal(deriveNextChunkIndex([0, 1, 5], [9]), 10);
});

test("gaps and duplicates are detected, not repaired", () => {
  const a = analyzeChunkIndexes([0, 1, 1, 3, 5]);
  assert.deepEqual(a.duplicates, [1]);
  assert.deepEqual(a.gaps, [2, 4]);
  assert.equal(a.maxIndex, 5);
  assert.equal(a.distinctCount, 4);
});

test("summary: runs, bytes, MIME types, indexes, and legacy objects counted separately", () => {
  const s = summarizeStoredChunks([
    stored(0, RUN_A, 100),
    stored(1, RUN_A, 150),
    stored(2, RUN_B, 200, "audio/mp4"),
    stored(4, RUN_B, 50, "audio/mp4"),
    stored(9, null, 999),
  ]);
  assert.equal(s.chunkCount, 5);
  assert.equal(s.runCount, 2);
  assert.equal(s.totalBytes, 1499);
  assert.deepEqual(s.mimeTypes, ["audio/mp4", "audio/webm"]);
  assert.deepEqual(s.gaps, [3, 5, 6, 7, 8]);
  assert.equal(s.legacyObjectCount, 1);
  assert.deepEqual(s.runs.map((r) => [r.runId, r.chunkCount, r.firstChunkIndex, r.lastChunkIndex, r.totalBytes]), [
    [RUN_A, 2, 0, 1, 250],
    [RUN_B, 2, 2, 4, 250],
  ]);
});

// ─── resume ─────────────────────────────────────────────────────────────────────────────────

test("resume: a lookup ERROR never yields create (no duplicate session on lookup failure)", () => {
  const d = decideCaptureSessionResume({ sessions: [], error: "db down" });
  assert.equal(d.kind, "error");
});

test("resume: nothing in progress -> create", () => {
  assert.deepEqual(decideCaptureSessionResume({ sessions: [] }), { kind: "create" });
});

test("resume: resumes the newest native in-progress session", () => {
  const d = decideCaptureSessionResume({
    sessions: [
      { id: "old", startedAt: "2026-09-29T10:00:00Z", isNativeCapture: true },
      { id: "new", startedAt: "2026-09-30T10:00:00Z", isNativeCapture: true },
    ],
  });
  assert.deepEqual(d, { kind: "resume", sessionId: "new" });
});

test("resume: a legacy-flow in-progress session is ignored — never resumed; the native one is", () => {
  const d = decideCaptureSessionResume({
    sessions: [
      { id: "legacy", startedAt: "2026-10-01T10:00:00Z", isNativeCapture: false },
      { id: "native", startedAt: "2026-09-30T10:00:00Z", isNativeCapture: true },
    ],
  });
  assert.deepEqual(d, { kind: "resume", sessionId: "native" });
});

test("resume: only a stale legacy session exists -> create a new native session (legacy one untouched, capture not blocked)", () => {
  const d = decideCaptureSessionResume({ sessions: [{ id: "legacy", startedAt: "2026-09-01T10:00:00Z", isNativeCapture: false }] });
  assert.deepEqual(d, { kind: "create" });
});

// ─── existing-object idempotency ────────────────────────────────────────────────────────────

const upload = { chunkIndex: 4, runId: RUN_A, mimeType: "audio/webm;codecs=opus", size: 100 };

test("upload: nothing stored at the index -> upload to the MIME-aware path", () => {
  const d = decideChunkUpload(SESSION, upload, []);
  assert.deepEqual(d, { kind: "upload", path: `${SESSION}/000004_${RUN_A}.webm` });
});

test("upload: identical object already stored -> idempotent success (no infinite retry)", () => {
  const d = decideChunkUpload(SESSION, upload, [stored(4, RUN_A, 100, "audio/webm;codecs=opus")]);
  assert.equal(d.kind, "already_uploaded");
});

test("upload: server MIME without codecs params still matches", () => {
  assert.equal(decideChunkUpload(SESSION, upload, [stored(4, RUN_A, 100, "audio/webm")]).kind, "already_uploaded");
});

test("upload: different run at the same index -> conflict (reused index is never overwritten)", () => {
  assert.equal(decideChunkUpload(SESSION, upload, [stored(4, RUN_B, 100)]).kind, "conflict");
});

test("upload: same run, different size -> conflict", () => {
  assert.equal(decideChunkUpload(SESSION, upload, [stored(4, RUN_A, 99)]).kind, "conflict");
});

test("upload: same run and size but different container type -> conflict", () => {
  assert.equal(decideChunkUpload(SESSION, upload, [stored(4, RUN_A, 100, "audio/mp4")]).kind, "conflict");
});

test("upload: objects at OTHER indexes are ignored", () => {
  assert.equal(decideChunkUpload(SESSION, upload, [stored(40, RUN_B, 5)]).kind, "upload");
});

test("upload: invalid requests are rejected before any path is built", () => {
  assert.equal(decideChunkUpload(SESSION, { ...upload, size: 0 }, []).kind, "invalid");
  assert.equal(decideChunkUpload(SESSION, { ...upload, mimeType: "video/mp4" }, []).kind, "invalid");
  assert.equal(decideChunkUpload(SESSION, { ...upload, runId: "x" }, []).kind, "invalid");
});

// ─── finalize ───────────────────────────────────────────────────────────────────────────────

test("finalize: every local chunk verified in storage -> finalize to captured", () => {
  const d = decideCaptureFinalize({
    sessionStatus: "recording",
    manifest: [entry(0), entry(1), entry(2, RUN_B)],
    storedChunks: [stored(0, RUN_A), stored(1, RUN_A), stored(2, RUN_B)],
  });
  assert.equal(d.kind, "finalize");
  if (d.kind === "finalize") {
    assert.equal(d.nextStatus, "captured");
    assert.equal(d.summary.runCount, 2);
    assert.equal(d.summary.chunkCount, 3);
  }
});

test("finalize: a missing upload is INCOMPLETE — never captured", () => {
  const d = decideCaptureFinalize({
    sessionStatus: "recording",
    manifest: [entry(0), entry(1), entry(2)],
    storedChunks: [stored(0, RUN_A), stored(2, RUN_A)],
  });
  assert.deepEqual(d.kind === "incomplete" && d.missingChunkIndexes, [1]);
});

test("finalize: a size mismatch (partial upload) is INCOMPLETE", () => {
  const d = decideCaptureFinalize({ sessionStatus: "recording", manifest: [entry(0, RUN_A, 100)], storedChunks: [stored(0, RUN_A, 60)] });
  assert.equal(d.kind, "incomplete");
});

test("finalize: nothing uploaded at all is rejected", () => {
  assert.equal(decideCaptureFinalize({ sessionStatus: "recording", manifest: [], storedChunks: [] }).kind, "rejected");
});

test("finalize: stored duplicates at one index are rejected", () => {
  const d = decideCaptureFinalize({ sessionStatus: "recording", manifest: [], storedChunks: [stored(0, RUN_A), stored(0, RUN_B)] });
  assert.equal(d.kind, "rejected");
});

test("finalize: gaps are recorded but do not block (an index can be consumed by a chunk lost on-device)", () => {
  const d = decideCaptureFinalize({ sessionStatus: "recording", manifest: [entry(0), entry(2)], storedChunks: [stored(0, RUN_A), stored(2, RUN_A)] });
  assert.equal(d.kind, "finalize");
  if (d.kind === "finalize") assert.deepEqual(d.summary.gaps, [1]);
});

test("finalize: chunks uploaded from another device (not in this manifest) are kept and counted", () => {
  const d = decideCaptureFinalize({ sessionStatus: "recording", manifest: [entry(3, RUN_B)], storedChunks: [stored(0, RUN_A), stored(1, RUN_A), stored(3, RUN_B)] });
  assert.equal(d.kind === "finalize" && d.summary.chunkCount, 3);
});

test("finalize: already captured is idempotent success; any other status is rejected", () => {
  assert.equal(decideCaptureFinalize({ sessionStatus: "captured", manifest: [], storedChunks: [] }).kind, "already_captured");
  for (const status of ["queued", "processing", "failed", "draft", "needs_review", "approved"]) {
    assert.equal(decideCaptureFinalize({ sessionStatus: status, manifest: [entry(0)], storedChunks: [stored(0, RUN_A)] }).kind, "rejected");
  }
});

test("finalize can NEVER produce queued, across every outcome", () => {
  const cases = [
    { sessionStatus: "recording", manifest: [entry(0)], storedChunks: [stored(0, RUN_A)] },
    { sessionStatus: "recording", manifest: [entry(0)], storedChunks: [] },
    { sessionStatus: "recording", manifest: [entry(0), entry(1)], storedChunks: [stored(0, RUN_A)] },
    { sessionStatus: "captured", manifest: [], storedChunks: [] },
    { sessionStatus: "queued", manifest: [], storedChunks: [] },
  ];
  for (const c of cases) {
    const d = decideCaptureFinalize(c);
    assert.ok(!JSON.stringify(d).includes('"queued"') || c.sessionStatus === "queued", JSON.stringify(d));
    if (d.kind === "finalize") assert.equal(d.nextStatus, CAPTURED_SESSION_STATUS);
  }
});

test("finalize: malformed manifest entries are rejected", () => {
  const d = decideCaptureFinalize({
    sessionStatus: "recording",
    manifest: [{ chunkIndex: -1, runId: RUN_A, mimeType: "audio/webm", size: 1, recordedAt: 0 }],
    storedChunks: [stored(0, RUN_A)],
  });
  assert.equal(d.kind, "rejected");
});

// ─── authorization / ownership ──────────────────────────────────────────────────────────────

const nativeSession = { residentId: RESIDENT, status: "recording", isNativeCapture: true };

test("access: exactly the roles authorized for the normal Assessment button may capture — no broader", () => {
  for (const role of AUTH_ROLES) {
    assert.equal(
      decideCaptureAccess({ role, residentInScope: true, residentId: RESIDENT }).ok,
      canCaptureResidentAssessment(role),
      role
    );
  }
  for (const role of ASSESSOR_ROLES) {
    assert.equal(decideCaptureAccess({ role, residentInScope: true, residentId: RESIDENT }).ok, true, role);
  }
  assert.equal(decideCaptureAccess({ role: "office_staff", residentInScope: true, residentId: RESIDENT }).ok, false);
  assert.equal(decideCaptureAccess({ role: null, residentInScope: true, residentId: RESIDENT }).ok, false);
});

test("access: raw-audio inspection stays admin/manager only, and is always a subset of capture roles", () => {
  for (const role of AUTH_ROLES) {
    const inspect = decideCaptureAccess({ role, residentInScope: true, residentId: RESIDENT, requireAudioInspection: true }).ok;
    assert.equal(inspect, role === "admin" || role === "manager", role);
    if (canInspectCapturedAssessmentAudio(role)) assert.equal(canCaptureResidentAssessment(role), true, role);
  }
});

test("access: resident outside the caller's community scope is refused", () => {
  assert.equal(decideCaptureAccess({ role: "admin", residentInScope: false, residentId: RESIDENT }).ok, false);
});

test("access: session must belong to the resident in the URL", () => {
  const d = decideCaptureAccess({
    role: "manager",
    residentInScope: true,
    residentId: RESIDENT,
    session: { ...nativeSession, residentId: "99999999-2222-4333-8444-555555555555" },
  });
  assert.equal(d.ok, false);
});

test("access: missing session refused; non-native session refused (existing capture flow untouchable)", () => {
  assert.equal(decideCaptureAccess({ role: "admin", residentInScope: true, residentId: RESIDENT, session: null }).ok, false);
  assert.equal(
    decideCaptureAccess({ role: "admin", residentInScope: true, residentId: RESIDENT, session: { ...nativeSession, isNativeCapture: false } }).ok,
    false
  );
});

test("access: session status must be in the action's allowed set", () => {
  const base = { role: "admin" as const, residentInScope: true, residentId: RESIDENT };
  assert.equal(decideCaptureAccess({ ...base, session: nativeSession, allowedStatuses: ["recording"] }).ok, true);
  assert.equal(decideCaptureAccess({ ...base, session: { ...nativeSession, status: "draft" }, allowedStatuses: ["recording", "captured"] }).ok, false);
});

// ─── entry point: the one normal Assessment button ──────────────────────────────────────────

function walk(rel: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(repoRoot, rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(child));
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !child.includes("__tests__")) out.push(child);
  }
  return out;
}
const uiFiles = [...walk("app"), ...walk("components")];
const codeOf = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("entry: native capture href is the in-app capture route", () => {
  assert.equal(nativeCaptureHref(RESIDENT), `/residents/${RESIDENT}/assessment/capture`);
});

test("entry: the existing Assessment button links to native capture and no longer launches serve-intake", () => {
  const code = codeOf("components/residents/AssessmentCaptureButton.tsx");
  assert.match(code, /href=\{nativeCaptureHref\(residentId\)\}/);
  assert.ok(!/startAssessmentCapture|window\.open|NEXT_PUBLIC_SERVE_INTAKE_URL|serve-intake|captureUrl/.test(code));
});

test("entry: the button keeps its props/label contract for both call sites", () => {
  const code = codeOf("components/residents/AssessmentCaptureButton.tsx");
  assert.match(code, /label = "Assessment"/);
  assert.match(code, /className=\{\s*className \?\?/);
  assert.match(codeOf("components/residents/WorkWithThisPersonStrip.tsx"), /canCaptureAssessment && \(\s*<AssessmentCaptureButton/);
});

test("entry: exactly one assessment-recording action — no other UI links to capture or to the legacy recorder", () => {
  const linking = uiFiles.filter((f) => /nativeCaptureHref\(|\/assessment\/capture/.test(codeOf(f)));
  assert.deepEqual(linking, ["components/residents/AssessmentCaptureButton.tsx"]);
  for (const f of uiFiles) {
    const code = codeOf(f);
    assert.ok(!/Record on this device|Mobile Capture Pilot/.test(code), `${f} still has the pilot affordance`);
    assert.ok(!/startAssessmentCapture\(/.test(code), `${f} still launches the legacy handoff`);
  }
});

test("entry: the capture page is gated by the same permission as the button", () => {
  const code = codeOf("app/residents/[id]/assessment/capture/page.tsx");
  assert.match(code, /canCaptureResidentAssessment\(profile\.role\)/);
  assert.ok(!/canUseMobileCapturePilot/.test(code));
});

test("history: Assessment History still lists every session with its label, Review link, failure Retry, and paste fallback", () => {
  const code = codeOf("components/residents/AssessmentSection.tsx");
  assert.match(code, /sessions\.map\(/);
  assert.match(code, /s\.status === "draft" \|\| s\.status === "needs_review" \|\| s\.status === "approved"/);
  assert.match(code, /<RetrySessionButton session=\{s\} \/>/);
  assert.match(code, /Paste Transcript \(admin\/test fallback\)/);
  for (const status of ["recording", "queued", "processing", "failed", "draft", "needs_review", "approved", "amended", "operationalized"]) {
    assert.ok(ASSESSMENT_SESSION_STATUS_LABELS[status], status);
  }
});

// ─── synthetic-test marking ─────────────────────────────────────────────────────────────────

const markBase = {
  role: "admin" as const,
  sessionStatus: "captured",
  isNativeCapture: true,
  alreadySynthetic: false,
  transcriptionStarted: false,
  attestedNoRealClientData: true,
};

test("synthetic marking: an admin may mark ONE finished Serve OS recording, with explicit attestation, before transcription", () => {
  assert.deepEqual(decideSyntheticTestMarking(markBase), { ok: true });
});

test("synthetic marking: refused for non-admins, other capture flows, unfinished/processed sessions, after transcription starts, or without attestation", () => {
  for (const role of ["manager", "executive", "operations", "office_staff", null] as const) {
    assert.equal(decideSyntheticTestMarking({ ...markBase, role }).ok, false, String(role));
  }
  assert.equal(decideSyntheticTestMarking({ ...markBase, isNativeCapture: false }).ok, false);
  for (const sessionStatus of ["recording", "queued", "processing", "failed", "draft", "needs_review", "approved"]) {
    assert.equal(decideSyntheticTestMarking({ ...markBase, sessionStatus }).ok, false, sessionStatus);
  }
  assert.equal(decideSyntheticTestMarking({ ...markBase, transcriptionStarted: true }).ok, false);
  assert.equal(decideSyntheticTestMarking({ ...markBase, alreadySynthetic: true }).ok, false);
  assert.equal(decideSyntheticTestMarking({ ...markBase, attestedNoRealClientData: false }).ok, false);
});

test("STATIC: is_synthetic_test is written in exactly one place, never inferred from a name", () => {
  const writers = uiFiles.concat(walk("lib")).filter((f) => /is_synthetic_test: true/.test(codeOf(f)));
  assert.deepEqual(writers, ["lib/data/nativeAssessmentCapture.ts"]);
  assert.ok(!/display_name|residentName|full_name/.test(codeOf("lib/data/nativeAssessmentCapture.ts").split("markNativeSessionSyntheticTest")[1]?.split("export async function")[0] ?? ""));
});

// ─── transcription progress labels ──────────────────────────────────────────────────────────

test("labels: transcription progress is shown in plain language, never AWS/queue jargon", () => {
  assert.equal(assessmentSessionDisplayLabel("captured", "awaiting"), "Audio captured — awaiting transcription");
  assert.equal(assessmentSessionDisplayLabel("captured", "transcribing"), "Transcribing assessment");
  assert.equal(assessmentSessionDisplayLabel("queued", "transcribed"), "Transcript ready — preparing assessment");
  assert.equal(assessmentSessionDisplayLabel("processing", "transcribed"), "Transcript ready — preparing assessment");
  assert.equal(assessmentSessionDisplayLabel("failed", "failed"), "Transcription needs attention");
  assert.equal(assessmentSessionDisplayLabel("needs_review", "transcribed"), "Needs review");
  assert.equal(assessmentSessionDisplayLabel("queued"), "Queued", "pasted-transcript sessions unchanged");
  for (const s of ["awaiting", "transcribing", "failed", "transcribed"] as const) {
    for (const st of ["captured", "queued", "processing", "failed"]) assert.ok(!/aws|s3|transcribe job|queue/i.test(assessmentSessionDisplayLabel(st, s).replace(/^Queued$/, "")));
  }
});

// ─── microphone errors ──────────────────────────────────────────────────────────────────────

test("microphone errors map to visible, plain-language messages", () => {
  assert.match(microphoneErrorMessage("NotAllowedError"), /blocked/);
  assert.match(microphoneErrorMessage("NotReadableError"), /in use/);
  assert.match(microphoneErrorMessage("SecurityError"), /https/);
  assert.ok(microphoneErrorMessage(undefined).length > 0);
});

// ─── B3: browser-recorder pilot gate + honest captured state ─────────────────────────────────

test("capture roles: admin, manager, executive and operations capture; office_staff and signed-out users cannot", () => {
  assert.deepEqual([...AUTH_ROLES].filter((r) => canCaptureResidentAssessment(r)).sort(), [...ASSESSOR_ROLES].sort());
  for (const role of AUTH_ROLES) {
    const expected = (ASSESSOR_ROLES as readonly string[]).includes(role);
    assert.equal(canCaptureResidentAssessment(role), expected, role);
    assert.equal(decideCaptureAccess({ role, residentInScope: true, residentId: RESIDENT }).ok, expected, role);
  }
});

test("capture roles: signed-out (no role) is refused by both the predicate and the access decision", () => {
  for (const role of [null, undefined] as const) {
    assert.equal(canCaptureResidentAssessment(role), false);
    assert.equal(decideCaptureAccess({ role, residentInScope: true, residentId: RESIDENT }).ok, false);
  }
});

test("capture is permission only: a REAL assessment captured by ANY of the four assessor roles cannot pass the AWS processing gate without PHI attestation", () => {
  for (const role of ASSESSOR_ROLES) assert.equal(canCaptureResidentAssessment(role), true, role);
  // The gate takes no role at all — capture permission can never authorize processing, for any role.
  for (const env of [REAL_PROD_ENV, SYNTH_PREVIEW_ENV]) {
    // Paste Transcript is offered/accepted only with real-PHI AWS attestation — absent here.
    assert.equal(isAwsPhiProcessingConfirmed(env), false);
    assert.equal(decideAwsAssessmentAuthorization({ isSyntheticTest: false }, env).allowed, false);
    assert.equal(isCapturedTranscriptionEnabled({ isSyntheticTest: false }, env), false);
    assert.equal(
      decideExtractionPolicy({ transcriptText: "words", configuredProvider: "bedrock", awsAuthorization: decideAwsAssessmentAuthorization({ isSyntheticTest: false }, env) }).ok,
      false
    );
  }
  assert.equal(awsTranscriptionDispatchScope(REAL_PROD_ENV), "none", "the dispatcher selects nothing for processing");
  const gate = read("lib/assessmentIntelligence/phiGovernance.ts").split("export function decideAwsAssessmentAuthorization")[1].split("\n}\n")[0];
  assert.ok(!/role/i.test(gate), "AWS authorization never consults a role");
  // And the real-assessment notice is unchanged for whoever captured it.
  assert.equal(capturedAssessmentNotice(false).title, "Audio saved — transcription not yet enabled");
  assert.match(capturedAssessmentNotice(false).detail, /Nothing has been sent outside Serve/);
});

test("STATIC: the button, capture page, native-capture actions, and legacy handoff all use the one canonical predicate", () => {
  const page = codeOf("app/residents/[id]/page.tsx");
  assert.match(page, /const canCaptureAssessment = canCaptureResidentAssessment\(profile\?\.role\);/);
  assert.match(codeOf("app/residents/[id]/assessment/capture/page.tsx"), /canCaptureResidentAssessment\(profile\.role\)/);
  assert.match(codeOf("lib/actions/nativeAssessmentCapture.ts"), /decideCaptureAccess\(/);
  assert.match(codeOf("lib/actions/assessmentCapture.ts"), /canCaptureResidentAssessment\(profile\.role\)/);
  assert.match(codeOf("lib/assessmentCapture/captureLogic.ts"), /if \(!canCaptureResidentAssessment\(input\.role\)\)/);
});

const REAL_PROD_ENV = { ASSESSMENT_EXTRACTION_PROVIDER: "bedrock" };
const SYNTH_PREVIEW_ENV = { ASSESSMENT_EXTRACTION_PROVIDER: "bedrock", PHI_SYNTHETIC_TEST_MODE: "synthetic-only-not-for-production" };
const ATTESTED_ENV = { ASSESSMENT_EXTRACTION_PROVIDER: "bedrock", PHI_AWS_PROCESSING_CONFIRMED: "true" };

test("B3: a real recording is 'transcription not enabled' unless real-PHI AWS processing is attested", () => {
  assert.equal(isCapturedTranscriptionEnabled({ isSyntheticTest: false }, REAL_PROD_ENV), false);
  assert.equal(isCapturedTranscriptionEnabled({ isSyntheticTest: false }, SYNTH_PREVIEW_ENV), false, "synthetic mode never enables a real session");
  assert.equal(isCapturedTranscriptionEnabled({ isSyntheticTest: false }, ATTESTED_ENV), true);
});

test("B3: synthetic deploy-preview testing is preserved — an attested synthetic recording is still 'awaiting transcription'", () => {
  assert.equal(isCapturedTranscriptionEnabled({ isSyntheticTest: true }, SYNTH_PREVIEW_ENV), true);
  assert.equal(isCapturedTranscriptionEnabled({ isSyntheticTest: true }, REAL_PROD_ENV), false, "the session flag alone authorizes nothing");
});

test("B3: the captured notice explains plainly that transcription of real assessments is not enabled", () => {
  const off = capturedAssessmentNotice(false);
  assert.equal(off.title, CAPTURED_TRANSCRIPTION_NOT_ENABLED_LABEL);
  assert.match(off.detail, /Transcription of real assessments is not currently enabled/);
  assert.match(off.detail, /saved securely/);
  assert.match(off.detail, /Nothing has been sent outside Serve/);
  assert.ok(!/awaiting/i.test(off.title + off.detail), "never an indefinite 'awaiting'");
  assert.equal(capturedAssessmentNotice(true).title, "Audio captured — awaiting transcription");
});

test("B3: history labels a non-authorized captured session 'not yet enabled', leaves everything else unchanged", () => {
  const sessions = [
    { id: "real-captured", status: "captured", is_synthetic_test: false },
    { id: "synthetic-captured", status: "captured", is_synthetic_test: true },
    { id: "transcribing", status: "captured", is_synthetic_test: false },
    { id: "draft", status: "draft", is_synthetic_test: false },
    { id: "legacy-processing", status: "processing", is_synthetic_test: false },
  ];
  const states = { "real-captured": "awaiting", "synthetic-captured": "awaiting", transcribing: "transcribing", draft: "transcribed" } as const;
  const prod = refineCapturedDisplayStates(sessions, states, REAL_PROD_ENV);
  assert.equal(prod["real-captured"], "not_enabled");
  assert.equal(prod["synthetic-captured"], "not_enabled");
  assert.equal(prod.transcribing, "transcribing");
  assert.equal(prod.draft, "transcribed");
  assert.equal(prod["legacy-processing"], undefined, "non-captured sessions are never relabeled");
  const preview = refineCapturedDisplayStates(sessions, states, SYNTH_PREVIEW_ENV);
  assert.equal(preview["synthetic-captured"], "awaiting");
  assert.equal(preview["real-captured"], "not_enabled");
  assert.equal(assessmentSessionDisplayLabel("captured", "not_enabled"), CAPTURED_TRANSCRIPTION_NOT_ENABLED_LABEL);
  assert.equal(assessmentSessionDisplayLabel("captured", "awaiting"), "Audio captured — awaiting transcription");
});

test("B3 STATIC: capture finish, the review page, and history all use the authorization-aware notice", () => {
  const actions = codeOf("lib/actions/nativeAssessmentCapture.ts");
  assert.equal((actions.match(/transcriptionEnabled: isCapturedTranscriptionEnabled\(\{ isSyntheticTest: access\.session\.isSyntheticTest \}\)/g) ?? []).length, 2);
  const screen = codeOf("components/residents/assessment/CaptureScreen.tsx");
  assert.match(screen, /capturedAssessmentNotice\(done\.transcriptionEnabled\)\.title/);
  assert.ok(!screen.includes(">Audio captured — awaiting transcription<"), "no hard-coded awaiting text");
  const review = codeOf("app/residents/[id]/assessment/[sessionId]/page.tsx");
  assert.match(review, /capturedAssessmentNotice\(isCapturedTranscriptionEnabled\(\{ isSyntheticTest: reviewData\.session\.is_synthetic_test === true \}\)\)/);
  assert.match(codeOf("app/residents/[id]/page.tsx"), /refineCapturedDisplayStates\(assessmentSessions, await getTranscriptionDisplayStates\(/);
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
