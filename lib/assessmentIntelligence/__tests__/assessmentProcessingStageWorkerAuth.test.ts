import assert from "node:assert/strict";
import handler from "../../../netlify/functions/assessment-processing-stage-worker-background.ts";

// Narrow, deliberately: this only exercises the shared-secret guard that runs before ANY
// database call (advanceAssessmentProcessing) is ever reached — the same "test the guard, not
// the full DB-dependent path" convention used throughout this test suite (see
// awsTranscribeProvider.test.ts, pipeline.test.ts). The background stage worker's endpoint is a
// plain reachable HTTP URL (nothing about "-background" makes it private on its own), so this
// guard is the one thing standing between an unauthenticated request and a real AWS/DB call —
// worth its own explicit coverage.

type Test = { name: string; fn: () => Promise<void> | void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ORIGINAL_SECRET = process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
function restoreEnv() {
  if (ORIGINAL_SECRET === undefined) delete process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  else process.env.ASSESSMENT_PROCESSING_WORKER_SECRET = ORIGINAL_SECRET;
}

test("a request with no secret header is rejected with 401 before any body parsing or DB access", async () => {
  process.env.ASSESSMENT_PROCESSING_WORKER_SECRET = "correct-secret";
  const response = await handler(new Request("https://example.test/.netlify/functions/assessment-processing-stage-worker-background", { method: "POST" }));
  assert.equal(response.status, 401);
  restoreEnv();
});

test("a request with the wrong secret is rejected with 401", async () => {
  process.env.ASSESSMENT_PROCESSING_WORKER_SECRET = "correct-secret";
  const response = await handler(
    new Request("https://example.test/.netlify/functions/assessment-processing-stage-worker-background", {
      method: "POST",
      headers: { "x-assessment-worker-secret": "wrong-secret" },
      body: JSON.stringify({ assessmentSessionId: "00000000-0000-0000-0000-000000000000" }),
    })
  );
  assert.equal(response.status, 401);
  restoreEnv();
});

test("an unset ASSESSMENT_PROCESSING_WORKER_SECRET rejects every request, even one presenting a matching-looking value, rather than treating an unconfigured secret as 'no check required'", async () => {
  delete process.env.ASSESSMENT_PROCESSING_WORKER_SECRET;
  const response = await handler(
    new Request("https://example.test/.netlify/functions/assessment-processing-stage-worker-background", {
      method: "POST",
      headers: { "x-assessment-worker-secret": "" },
      body: JSON.stringify({ assessmentSessionId: "00000000-0000-0000-0000-000000000000" }),
    })
  );
  assert.equal(response.status, 401);
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
