import assert from "node:assert/strict";
import { isSessionAuthorizedForConfiguredTranscriptionProvider } from "../pipeline.ts";
import type { AssessmentSessionRecord } from "../../data/assessmentIntelligence.ts";

// Covers the 2026-08-16 "AWS Synthetic Assessment Deployment Preflight" hardening: the real
// dispatcher/background-worker path must authorize AWS processing per-session, never off a
// broad environment-wide flag alone. These tests exist specifically to prove the two properties
// that matter most: (1) an ordinary session stays fail-closed no matter what the environment
// looks like, and (2) marking ONE session synthetic never authorizes any OTHER session — the
// row flag and the environment flag are both required, and neither alone is enough.

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ORIGINAL_PROVIDER = process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER;
const ORIGINAL_AWS_GATE = process.env.PHI_AWS_PROCESSING_CONFIRMED;
const ORIGINAL_OPENAI_GATE = process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
const ORIGINAL_SYNTHETIC = process.env.PHI_SYNTHETIC_TEST_MODE;

function restoreEnv() {
  for (const [key, value] of [
    ["ASSESSMENT_TRANSCRIPTION_PROVIDER", ORIGINAL_PROVIDER],
    ["PHI_AWS_PROCESSING_CONFIRMED", ORIGINAL_AWS_GATE],
    ["PHI_OPENAI_PROCESSING_CONFIRMED", ORIGINAL_OPENAI_GATE],
    ["PHI_SYNTHETIC_TEST_MODE", ORIGINAL_SYNTHETIC],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearAllGateEnv() {
  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  delete process.env.PHI_SYNTHETIC_TEST_MODE;
}

function session(overrides: Partial<AssessmentSessionRecord> = {}): AssessmentSessionRecord {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    resident_id: "00000000-0000-0000-0000-000000000001",
    status: "processing",
    initiated_from: "existing_person",
    started_by: "test",
    started_at: new Date().toISOString(),
    finished_at: null,
    is_synthetic_test: false,
    ...overrides,
  };
}

test("ordinary session (is_synthetic_test=false), no gate confirmed at all: fail-closed", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "aws";
  clearAllGateEnv();
  assert.equal(isSessionAuthorizedForConfiguredTranscriptionProvider(session()), false);
  restoreEnv();
});

test("ordinary session, production gate PHI_AWS_PROCESSING_CONFIRMED=true: authorized", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "aws";
  clearAllGateEnv();
  process.env.PHI_AWS_PROCESSING_CONFIRMED = "true";
  assert.equal(isSessionAuthorizedForConfiguredTranscriptionProvider(session()), true);
  restoreEnv();
});

test("NO ARBITRARY-SESSION BYPASS: PHI_SYNTHETIC_TEST_MODE set, but this session's is_synthetic_test is false — still fail-closed", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "aws";
  clearAllGateEnv();
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  assert.equal(isSessionAuthorizedForConfiguredTranscriptionProvider(session({ is_synthetic_test: false })), false);
  restoreEnv();
});

test("synthetic session, but PHI_SYNTHETIC_TEST_MODE NOT enabled on this deployment — still fail-closed (the DB flag alone is not sufficient)", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "aws";
  clearAllGateEnv();
  assert.equal(isSessionAuthorizedForConfiguredTranscriptionProvider(session({ is_synthetic_test: true })), false);
  restoreEnv();
});

test("synthetic session AND PHI_SYNTHETIC_TEST_MODE enabled, PHI_AWS_PROCESSING_CONFIRMED still unset: authorized via the synthetic path only", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "aws";
  clearAllGateEnv();
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  assert.equal(isSessionAuthorizedForConfiguredTranscriptionProvider(session({ is_synthetic_test: true })), true);
  restoreEnv();
});

test("synthetic session with a near-miss PHI_SYNTHETIC_TEST_MODE value: still fail-closed", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "aws";
  clearAllGateEnv();
  process.env.PHI_SYNTHETIC_TEST_MODE = "not-the-exact-expected-value";
  assert.equal(isSessionAuthorizedForConfiguredTranscriptionProvider(session({ is_synthetic_test: true })), false);
  restoreEnv();
});

test("openai provider configured: resolution is unaffected by is_synthetic_test or PHI_SYNTHETIC_TEST_MODE — only PHI_OPENAI_PROCESSING_CONFIRMED matters", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "openai";
  clearAllGateEnv();
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  assert.equal(isSessionAuthorizedForConfiguredTranscriptionProvider(session({ is_synthetic_test: true })), false);
  process.env.PHI_OPENAI_PROCESSING_CONFIRMED = "true";
  assert.equal(isSessionAuthorizedForConfiguredTranscriptionProvider(session({ is_synthetic_test: false })), true);
  restoreEnv();
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
