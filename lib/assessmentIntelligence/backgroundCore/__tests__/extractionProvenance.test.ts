import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildExtractionProvenance,
  mergeExtractionProvenance,
  describeProvenanceForLog,
  EXTRACTION_HISTORY_LIMIT,
  type ExtractionProvenanceRecord,
} from "../extractionProvenance.ts";
import { extractFactsViaBedrockClaude, type BedrockConverseClient } from "../providers/bedrockClaudeProvider.ts";
import { decideRetryEligibility } from "../../processingQueue.ts";
import { decideRetryRoute } from "../transcription/transcriptionState.ts";

// No AWS, network, or database: the real Bedrock provider is exercised with an injected fake
// Converse client; provenance building/merging is pure; pipeline ordering is checked statically.

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const codeOf = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

function fakeClientReturning(text: string): BedrockConverseClient {
  return {
    send: async () => ({
      output: { message: { role: "assistant", content: [{ text }] } },
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      metrics: { latencyMs: 0 },
      $metadata: {},
    }),
  };
}

const AT = new Date("2026-10-01T12:33:20.000Z");
const PREVIEW = { context: "deploy-preview", deployPrimeUrl: "https://deploy-preview-8--os-servecaregiving.netlify.app" };

async function provenanceFor(bedrockText: string): Promise<ExtractionProvenanceRecord> {
  const r = await extractFactsViaBedrockClaude("a 3,121-character transcript with no assessment content", fakeClientReturning(bedrockText));
  return buildExtractionProvenance({
    provider: r.provider,
    model: r.modelId,
    outcome: r.rawResponseParseError ? "parse_error" : "succeeded",
    at: AT,
    acceptedCount: r.rawResponseParseError ? 0 : r.accepted.length,
    rejectedCount: r.rawResponseParseError ? 0 : r.rejected.length,
    runRef: "extraction-1",
    deployContext: PREVIEW,
    error: r.rawResponseParseError,
  });
}

// ─── A. durable provenance ────────────────────────────────────────────────────────────────────

test("zero-fact Bedrock extraction yields full provenance: provider, model, timestamp, outcome, accepted 0, rejected 0, deploy context", async () => {
  const p = await provenanceFor(JSON.stringify({ facts: [] }));
  assert.deepEqual(p, {
    provider: "bedrock-claude",
    model: "us.anthropic.claude-sonnet-4-6",
    outcome: "succeeded",
    extracted_at: "2026-10-01T12:33:20.000Z",
    accepted_count: 0,
    rejected_count: 0,
    extraction_run_ref: "extraction-1",
    deploy_context: "deploy-preview",
    deploy_url: "https://deploy-preview-8--os-servecaregiving.netlify.app",
    error: null,
  });
});

test("rejected facts are counted and persisted even when none are accepted", async () => {
  const p = await provenanceFor(
    JSON.stringify({ facts: [{ field_path: "not.a.real.field", value: true, assertion_state: "confirmed_yes", confidence: "high" }, { nonsense: 1 }] })
  );
  assert.equal(p.outcome, "succeeded");
  assert.equal(p.accepted_count, 0);
  assert.ok((p.rejected_count ?? 0) >= 1, "rejected count must be persisted");
});

test("a missing 'facts' key is a zero-fact success (as the provider behaves), still fully attributed", async () => {
  const p = await provenanceFor(JSON.stringify({ something: "else" }));
  assert.equal(p.outcome, "succeeded");
  assert.equal(p.accepted_count, 0);
  assert.equal(p.provider, "bedrock-claude");
});

test("malformed (non-JSON) output is recorded as outcome parse_error with a bounded error, never transcript text", async () => {
  const p = await provenanceFor("Sorry, I can't help with that " + "x".repeat(1000));
  assert.equal(p.outcome, "parse_error");
  assert.ok(p.error && p.error.length <= 300);
  assert.ok(!p.error!.includes("3,121-character transcript"));
});

test("provider failure provenance: attributed to the provider, counts null, error kept", () => {
  const p = buildExtractionProvenance({
    provider: "bedrock-claude", model: "us.anthropic.claude-sonnet-4-6", outcome: "provider_error", at: AT,
    acceptedCount: null, rejectedCount: null, runRef: "r", deployContext: null, error: new Error("AccessDeniedException: not authorized"),
  });
  assert.equal(p.accepted_count, null);
  assert.equal(p.deploy_context, null);
  assert.match(p.error ?? "", /AccessDenied/);
});

test("merge preserves every existing capture/transcription source_payload key and never mutates its input", () => {
  const existing = {
    capture_origin: "serve_os_native_capture",
    capture_version: "native-capture-v0.1",
    chunk_count: 85,
    total_bytes: 21_330_000,
    run_log: [{ run_id: "a", started_at: "x", ended_at: "y", end_reason: "page_hidden" }],
    capture_continuity: "interrupted",
    interruption_count: 1,
    synthetic_test_attestation: { attested_by: "Admin", attested_at: "t" },
  };
  const snapshot = JSON.parse(JSON.stringify(existing));
  const record = buildExtractionProvenance({ provider: "bedrock-claude", model: "m", outcome: "succeeded", at: AT, acceptedCount: 0, rejectedCount: 0, runRef: "r" });
  const merged = mergeExtractionProvenance(existing, record);
  for (const [k, v] of Object.entries(snapshot)) assert.deepEqual(merged[k], v, k);
  assert.deepEqual(existing, snapshot, "input not mutated");
  assert.deepEqual(merged.extraction_provenance, record);
  assert.deepEqual(merged.extraction_history, [record]);
});

test("history keeps the last attempts (bounded), latest first-class; a retry after a parse error is visible", () => {
  let payload: Record<string, unknown> | null = null;
  const records: ExtractionProvenanceRecord[] = [];
  for (let i = 0; i < EXTRACTION_HISTORY_LIMIT + 3; i++) {
    const r = buildExtractionProvenance({ provider: "bedrock-claude", model: "m", outcome: i === 0 ? "parse_error" : "succeeded", at: new Date(AT.getTime() + i * 1000), acceptedCount: i, rejectedCount: 0, runRef: `r${i}` });
    records.push(r);
    payload = mergeExtractionProvenance(payload, r);
  }
  assert.equal((payload!.extraction_history as unknown[]).length, EXTRACTION_HISTORY_LIMIT);
  assert.deepEqual(payload!.extraction_provenance, records[records.length - 1]);
});

test("worker diagnostic log carries provider/model/outcome/counts", () => {
  const r = buildExtractionProvenance({ provider: "bedrock-claude", model: "us.anthropic.claude-sonnet-4-6", outcome: "succeeded", at: AT, acceptedCount: 0, rejectedCount: 2, runRef: "r" });
  assert.equal(describeProvenanceForLog(r), "provider=bedrock-claude model=us.anthropic.claude-sonnet-4-6 outcome=succeeded accepted=0 rejected=2");
  const worker = codeOf("netlify/functions/assessment-processing-stage-worker-background.mts");
  assert.match(worker, /\$\{result\.detail \? ` \[\$\{result\.detail\}\]` : ""\}/);
});

test("STATIC: provenance is written for success BEFORE the status advances, and for parse and provider errors too", () => {
  const core = codeOf("lib/assessmentIntelligence/backgroundCore/processingCore.ts");
  const body = core.split("export async function runExtractionPipelineForSession")[1].split("export interface AdvanceProcessingResult")[0];
  const iSuccess = body.indexOf('provenance("succeeded"');
  const iRecord = body.indexOf("await recordExtractionProvenance(sourceId, record);", iSuccess);
  const iStatus = body.indexOf("await updateAssessmentSessionStatus(");
  assert.ok(iSuccess > 0 && iRecord > iSuccess && iStatus > iRecord, "success provenance precedes draft/needs_review");
  assert.match(body, /provenance\("parse_error"/);
  assert.match(body, /provenance\("provider_error"[\s\S]*?throw err;/);
  assert.match(body, /deployContext: GENERATED_DEPLOY_CONTEXT/);
  const data = codeOf("lib/assessmentIntelligence/backgroundCore/dataAccess.ts");
  assert.match(data, /mergeExtractionProvenance\(\(data as \{ source_payload/);
  assert.match(data, /update\(\{ source_payload: merged \}\)/);
});

// ─── D. parse/error handling ──────────────────────────────────────────────────────────────────

test("STATIC: an unusable extraction response is a FAILED extraction (never 'processed', never stranded in processing)", () => {
  const core = codeOf("lib/assessmentIntelligence/backgroundCore/processingCore.ts");
  const body = core.split("export async function advanceQueuedAssessmentProcessing")[1].split("export interface AdvanceSessionResult")[0];
  assert.match(body, /if \(result\.error\) \{[\s\S]*?await markSessionFailed\(assessmentSessionId, reason\);\s*return \{ assessmentSessionId, outcome: "failed"/);
  const iFailCheck = body.indexOf("if (result.error)");
  const iProcessed = body.indexOf('outcome: "processed"');
  assert.ok(iFailCheck > 0 && iFailCheck < iProcessed, "the error check precedes the processed return");
});

test("a parse-failed session is visibly retryable through the existing path, back to extraction (transcript kept)", () => {
  assert.equal(decideRetryEligibility({ status: "failed", processingAttemptCount: 1, processingClaimedAt: "2026-10-01T12:33:00Z" }).allowed, true);
  assert.equal(decideRetryRoute({ hasNativeAudioSource: true, transcriptPersisted: true }), "extraction", "not re-transcribed");
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
