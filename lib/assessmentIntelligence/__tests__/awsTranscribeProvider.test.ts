import assert from "node:assert/strict";
import { startAwsTranscription, checkAwsTranscription } from "../providers/awsTranscribeProvider.ts";

// Deliberately narrow: the real S3/Transcribe/ffmpeg interaction (assemble, upload, start job,
// check status, read output, cleanup) requires either real AWS credentials or a fuller
// dependency-injection refactor than this pass includes — see this scope's completion report
// for that as recommended follow-up work, matching bedrockClaudeProvider.ts's own
// injectable-client pattern. What IS safely testable without any AWS/ffmpeg access: the guard
// behavior that runs before any real work is attempted, for both phases of the two-phase
// (start/check) interface.

type Test = { name: string; fn: () => Promise<void> | void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ORIGINAL_GATE = process.env.PHI_AWS_PROCESSING_CONFIRMED;
const ORIGINAL_SYNTHETIC = process.env.PHI_SYNTHETIC_TEST_MODE;
const ORIGINAL_BUCKET = process.env.SERVE_AWS_TRANSCRIBE_STAGING_BUCKET;
function restoreEnv() {
  if (ORIGINAL_GATE === undefined) delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  else process.env.PHI_AWS_PROCESSING_CONFIRMED = ORIGINAL_GATE;
  if (ORIGINAL_SYNTHETIC === undefined) delete process.env.PHI_SYNTHETIC_TEST_MODE;
  else process.env.PHI_SYNTHETIC_TEST_MODE = ORIGINAL_SYNTHETIC;
  if (ORIGINAL_BUCKET === undefined) delete process.env.SERVE_AWS_TRANSCRIBE_STAGING_BUCKET;
  else process.env.SERVE_AWS_TRANSCRIBE_STAGING_BUCKET = ORIGINAL_BUCKET;
}

test("startAwsTranscription: the PHI gate is checked before anything else — an unconfirmed gate throws with no AWS call attempted", async () => {
  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  await assert.rejects(
    () => startAwsTranscription([{ path: "session-1/000000.webm", bytes: new ArrayBuffer(0), mimeType: "audio/webm" }]),
    /PHI_AWS_PROCESSING_CONFIRMED/
  );
  restoreEnv();
});

test("startAwsTranscription: an empty chunk list returns a completed, empty result without ever checking the staging bucket config", async () => {
  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  delete process.env.SERVE_AWS_TRANSCRIBE_STAGING_BUCKET; // deliberately unset — must not matter for zero chunks
  const outcome = await startAwsTranscription([], { syntheticTestOverride: true });
  assert.equal(outcome.status, "completed");
  assert.deepEqual(outcome.result?.segments, []);
  assert.deepEqual(outcome.result?.failedChunks, []);
  assert.equal(outcome.result?.provider, "aws-transcribe");
  restoreEnv();
});

test("startAwsTranscription: a missing SERVE_AWS_TRANSCRIBE_STAGING_BUCKET throws a clear, specific error once the gate passes and there's real work to do — before any ffmpeg assembly or credential resolution is attempted", async () => {
  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  delete process.env.SERVE_AWS_TRANSCRIBE_STAGING_BUCKET;
  await assert.rejects(
    () =>
      startAwsTranscription([{ path: "session-1/000000.webm", bytes: new ArrayBuffer(4), mimeType: "audio/webm" }], {
        syntheticTestOverride: true,
      }),
    /SERVE_AWS_TRANSCRIBE_STAGING_BUCKET/
  );
  restoreEnv();
});

test("checkAwsTranscription: the PHI gate is checked before any AWS call, same as startAwsTranscription", async () => {
  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  await assert.rejects(
    () => checkAwsTranscription({ providerId: "aws-transcribe", jobId: "fake-job", metadata: { bucket: "b", inputKey: "i", outputKey: "o" } }),
    /PHI_AWS_PROCESSING_CONFIRMED/
  );
  restoreEnv();
});

test("checkAwsTranscription: a handle missing required staging metadata fails cleanly rather than throwing an unhandled error", async () => {
  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  const outcome = await checkAwsTranscription({ providerId: "aws-transcribe", jobId: "fake-job" }, { syntheticTestOverride: true });
  assert.equal(outcome.status, "failed");
  assert.match(outcome.error ?? "", /staging metadata/);
  restoreEnv();
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
