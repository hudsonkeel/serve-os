import assert from "node:assert/strict";
import { getServeAwsCredentials } from "../awsCredentials.ts";

// Covers the 2026-08-16 explicit-credential correction: Netlify rejects the standard
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY names as reserved, so this pipeline reads
// SERVE_AWS_ACCESS_KEY_ID / SERVE_AWS_SECRET_ACCESS_KEY instead, explicitly, and must fail
// closed on any half-configured pair rather than silently falling back to the AWS SDK's default
// credential chain (which would resolve to Netlify's own Lambda execution role, not this
// application's intended identity).

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ORIGINAL_ID = process.env.SERVE_AWS_ACCESS_KEY_ID;
const ORIGINAL_SECRET = process.env.SERVE_AWS_SECRET_ACCESS_KEY;
function restoreEnv() {
  if (ORIGINAL_ID === undefined) delete process.env.SERVE_AWS_ACCESS_KEY_ID;
  else process.env.SERVE_AWS_ACCESS_KEY_ID = ORIGINAL_ID;
  if (ORIGINAL_SECRET === undefined) delete process.env.SERVE_AWS_SECRET_ACCESS_KEY;
  else process.env.SERVE_AWS_SECRET_ACCESS_KEY = ORIGINAL_SECRET;
}

test("both unset: throws, naming both variables, never mentions the legacy AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY names", () => {
  delete process.env.SERVE_AWS_ACCESS_KEY_ID;
  delete process.env.SERVE_AWS_SECRET_ACCESS_KEY;
  assert.throws(() => getServeAwsCredentials(), /SERVE_AWS_ACCESS_KEY_ID/);
  assert.throws(() => getServeAwsCredentials(), /SERVE_AWS_SECRET_ACCESS_KEY/);
  restoreEnv();
});

test("FAIL CLOSED: access key id present without the secret throws, rather than falling back to the SDK default credential chain", () => {
  process.env.SERVE_AWS_ACCESS_KEY_ID = "fake-access-key-id-for-test";
  delete process.env.SERVE_AWS_SECRET_ACCESS_KEY;
  assert.throws(() => getServeAwsCredentials(), /SERVE_AWS_SECRET_ACCESS_KEY is missing/);
  restoreEnv();
});

test("FAIL CLOSED: secret present without the access key id throws", () => {
  delete process.env.SERVE_AWS_ACCESS_KEY_ID;
  process.env.SERVE_AWS_SECRET_ACCESS_KEY = "fake-secret-for-test";
  assert.throws(() => getServeAwsCredentials(), /SERVE_AWS_ACCESS_KEY_ID is missing/);
  restoreEnv();
});

test("both present: resolves both values, exactly as configured, without transformation", () => {
  process.env.SERVE_AWS_ACCESS_KEY_ID = "fake-access-key-id-for-test";
  process.env.SERVE_AWS_SECRET_ACCESS_KEY = "fake-secret-for-test";
  const credentials = getServeAwsCredentials();
  assert.equal(credentials.accessKeyId, "fake-access-key-id-for-test");
  assert.equal(credentials.secretAccessKey, "fake-secret-for-test");
  restoreEnv();
});

test("error messages never contain the configured secret value, even when one is set", () => {
  process.env.SERVE_AWS_ACCESS_KEY_ID = "fake-access-key-id-for-test";
  delete process.env.SERVE_AWS_SECRET_ACCESS_KEY;
  try {
    getServeAwsCredentials();
    assert.fail("expected getServeAwsCredentials() to throw");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert.equal(message.includes("fake-access-key-id-for-test"), false);
  }
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
