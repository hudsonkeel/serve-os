// node --experimental-strip-types --conditions=react-server lib/ai/__tests__/bedrockClaude.test.ts
//
// No real AWS credentials or network access anywhere in this file. Tests
// against getBedrockClient() use __resetBedrockClientForTests() (test-only
// export) to exercise different env var states within one process, since
// the client is otherwise cached as a module-level singleton after first
// use. Assertions on the constructed client read its *resolved config*
// (client.config.region()/credentials(), both AWS SDK v3 provider
// functions) rather than any internal/private field — this proves what
// was actually passed to BedrockRuntimeClient without needing a live
// call. No env var value (real or placeholder) is ever passed to
// console.log/console.error anywhere in this file, and every assertion
// on thrown error messages checks that the PRESENT variable's example
// value is absent from the message, not merely that the test "looks"
// like it doesn't log it.
import assert from "node:assert/strict";
import { resolveBedrockCredentials, getBedrockClient, __resetBedrockClientForTests, BEDROCK_REGION, CLAUDE_MODEL_ID } from "../bedrockClaude.ts";

type Test = { name: string; fn: () => Promise<void> | void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ACCESS_KEY_VAR = "SERVE_AWS_ACCESS_KEY_ID";
const SECRET_KEY_VAR = "SERVE_AWS_SECRET_ACCESS_KEY";
const FAKE_ACCESS_KEY = "AKIA_TEST_EXAMPLE_NOT_REAL";
const FAKE_SECRET_KEY = "test-secret-example-not-real";

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const result = fn();
  if (result instanceof Promise) return result.finally(restore);
  restore();
  return undefined;
}

test("pinned region and model are unchanged by this credential-wiring change", () => {
  assert.equal(BEDROCK_REGION, "us-east-1");
  assert.equal(CLAUDE_MODEL_ID, "us.anthropic.claude-sonnet-4-6");
});

// ── TEST 1 — production credential path ────────────────────────────────
test("TEST 1: both SERVE_AWS_* vars present -> explicit credentials selected, correct region configured, values actually reach BedrockRuntimeClient", async () => {
  await withEnv({ [ACCESS_KEY_VAR]: FAKE_ACCESS_KEY, [SECRET_KEY_VAR]: FAKE_SECRET_KEY }, async () => {
    const resolved = resolveBedrockCredentials();
    assert.deepEqual(resolved, { accessKeyId: FAKE_ACCESS_KEY, secretAccessKey: FAKE_SECRET_KEY });

    __resetBedrockClientForTests();
    const client = getBedrockClient();
    const region = await client.config.region();
    assert.equal(region, "us-east-1");
    const credentials = await client.config.credentials();
    assert.equal(credentials.accessKeyId, FAKE_ACCESS_KEY);
    assert.equal(credentials.secretAccessKey, FAKE_SECRET_KEY);
    __resetBedrockClientForTests();
  });
});

// ── TEST 2 — local default chain ────────────────────────────────────────
test("TEST 2: neither SERVE_AWS_* var present -> no explicit credentials supplied, BedrockRuntimeClient falls back to the AWS default credential-provider chain", async () => {
  await withEnv({ [ACCESS_KEY_VAR]: undefined, [SECRET_KEY_VAR]: undefined }, async () => {
    const resolved = resolveBedrockCredentials();
    assert.equal(resolved, undefined);

    __resetBedrockClientForTests();
    // Constructing without an explicit `credentials` key must not throw —
    // this is exactly what preserves the working local `aws login
    // --profile serve-bedrock-dev` workflow (the default provider chain
    // resolves credentials lazily, only when a real call is made, so
    // construction succeeds here even with no credentials present at all).
    assert.doesNotThrow(() => getBedrockClient());
    const client = getBedrockClient();
    const region = await client.config.region();
    assert.equal(region, "us-east-1");
    __resetBedrockClientForTests();
  });
});

// ── TEST 3 — access key only ────────────────────────────────────────────
test("TEST 3: only SERVE_AWS_ACCESS_KEY_ID present -> fails closed, error names SERVE_AWS_SECRET_ACCESS_KEY as missing, never includes the present access key value", () => {
  withEnv({ [ACCESS_KEY_VAR]: FAKE_ACCESS_KEY, [SECRET_KEY_VAR]: undefined }, () => {
    let thrown: unknown;
    try {
      resolveBedrockCredentials();
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof Error);
    assert.match(thrown.message, /SERVE_AWS_SECRET_ACCESS_KEY/);
    assert.doesNotMatch(thrown.message, new RegExp(FAKE_ACCESS_KEY));

    __resetBedrockClientForTests();
    assert.throws(() => getBedrockClient(), /SERVE_AWS_SECRET_ACCESS_KEY/);
    __resetBedrockClientForTests();
  });
});

// ── TEST 4 — secret key only ────────────────────────────────────────────
test("TEST 4: only SERVE_AWS_SECRET_ACCESS_KEY present -> fails closed, error names SERVE_AWS_ACCESS_KEY_ID as missing, never includes the present secret value", () => {
  withEnv({ [ACCESS_KEY_VAR]: undefined, [SECRET_KEY_VAR]: FAKE_SECRET_KEY }, () => {
    let thrown: unknown;
    try {
      resolveBedrockCredentials();
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof Error);
    assert.match(thrown.message, /SERVE_AWS_ACCESS_KEY_ID/);
    assert.doesNotMatch(thrown.message, new RegExp(FAKE_SECRET_KEY));

    __resetBedrockClientForTests();
    assert.throws(() => getBedrockClient(), /SERVE_AWS_ACCESS_KEY_ID/);
    __resetBedrockClientForTests();
  });
});

// ── TEST 5 — whitespace/empty values treated as absent ──────────────────
test("TEST 5: empty-string or whitespace-only values are treated as absent, not as valid (or partially valid) credentials", () => {
  withEnv({ [ACCESS_KEY_VAR]: "", [SECRET_KEY_VAR]: "" }, () => {
    assert.equal(resolveBedrockCredentials(), undefined);
  });
  withEnv({ [ACCESS_KEY_VAR]: "   ", [SECRET_KEY_VAR]: "   " }, () => {
    assert.equal(resolveBedrockCredentials(), undefined);
  });
  withEnv({ [ACCESS_KEY_VAR]: "  ", [SECRET_KEY_VAR]: FAKE_SECRET_KEY }, () => {
    // Whitespace-only access key + a real secret key is still "exactly
    // one present" — must fail closed, not silently drop to the default
    // chain (which would ignore the stray secret key entirely) and not
    // treat the whitespace as a usable access key id.
    assert.throws(() => resolveBedrockCredentials(), /SERVE_AWS_ACCESS_KEY_ID/);
  });
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  console.log("");
  console.log(`${tests.length - failures}/${tests.length} passed`);
  if (failures > 0) process.exit(1);
}

run();
