import assert from "node:assert/strict";
import {
  isPhiOpenAiProcessingConfirmed,
  requirePhiOpenAiProcessingConfirmed,
  isPhiAwsProcessingConfirmed,
  requirePhiAwsProcessingConfirmed,
} from "../phiGovernance.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ORIGINAL = process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
function restoreEnv() {
  if (ORIGINAL === undefined) delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  else process.env.PHI_OPENAI_PROCESSING_CONFIRMED = ORIGINAL;
}

test("unset flag is not confirmed — fail closed by default", () => {
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  assert.equal(isPhiOpenAiProcessingConfirmed(), false);
  assert.throws(() => requirePhiOpenAiProcessingConfirmed(), /PHI_OPENAI_PROCESSING_CONFIRMED/);
  restoreEnv();
});

test("any value other than the exact string 'true' is not confirmed (no truthy-string leniency)", () => {
  for (const v of ["TRUE", "1", "yes", "True ", " true"]) {
    process.env.PHI_OPENAI_PROCESSING_CONFIRMED = v;
    assert.equal(isPhiOpenAiProcessingConfirmed(), false, `expected "${v}" to NOT confirm`);
    assert.throws(() => requirePhiOpenAiProcessingConfirmed());
  }
  restoreEnv();
});

test("exact string 'true' confirms", () => {
  process.env.PHI_OPENAI_PROCESSING_CONFIRMED = "true";
  assert.equal(isPhiOpenAiProcessingConfirmed(), true);
  assert.doesNotThrow(() => requirePhiOpenAiProcessingConfirmed());
  restoreEnv();
});

const ORIGINAL_SYNTHETIC = process.env.PHI_SYNTHETIC_TEST_MODE;
function restoreSyntheticEnv() {
  if (ORIGINAL_SYNTHETIC === undefined) delete process.env.PHI_SYNTHETIC_TEST_MODE;
  else process.env.PHI_SYNTHETIC_TEST_MODE = ORIGINAL_SYNTHETIC;
}

test("SYNTHETIC OVERRIDE: requesting it without the separate PHI_SYNTHETIC_TEST_MODE flag still fails closed, and does NOT fall back to checking PHI_OPENAI_PROCESSING_CONFIRMED", () => {
  delete process.env.PHI_SYNTHETIC_TEST_MODE;
  process.env.PHI_OPENAI_PROCESSING_CONFIRMED = "true"; // even if the PRODUCTION flag is on...
  assert.equal(isPhiOpenAiProcessingConfirmed({ syntheticTestOverride: true }), false); // ...the override still requires its own flag
  assert.throws(() => requirePhiOpenAiProcessingConfirmed({ syntheticTestOverride: true }));
  restoreEnv();
  restoreSyntheticEnv();
});

test("SYNTHETIC OVERRIDE: setting PHI_SYNTHETIC_TEST_MODE alone does NOT satisfy the production gate (no override requested)", () => {
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  assert.equal(isPhiOpenAiProcessingConfirmed(), false);
  assert.throws(() => requirePhiOpenAiProcessingConfirmed());
  restoreEnv();
  restoreSyntheticEnv();
});

test("SYNTHETIC OVERRIDE: with syntheticTestOverride requested AND the exact expected flag value set, the override succeeds", () => {
  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  assert.equal(isPhiOpenAiProcessingConfirmed({ syntheticTestOverride: true }), true);
  assert.doesNotThrow(() => requirePhiOpenAiProcessingConfirmed({ syntheticTestOverride: true }));
  restoreEnv();
  restoreSyntheticEnv();
});

test("SYNTHETIC OVERRIDE: a near-miss value (not the exact expected string) fails closed", () => {
  for (const v of ["true", "synthetic", "SYNTHETIC-ONLY-NOT-FOR-PRODUCTION", "synthetic-only-not-for-production "]) {
    process.env.PHI_SYNTHETIC_TEST_MODE = v;
    assert.equal(isPhiOpenAiProcessingConfirmed({ syntheticTestOverride: true }), false, `expected "${v}" to NOT activate the override`);
  }
  restoreSyntheticEnv();
});

// ─── AWS gate — mirrors every OpenAI-gate test above, independently ───────────────────────
const ORIGINAL_AWS = process.env.PHI_AWS_PROCESSING_CONFIRMED;
function restoreAwsEnv() {
  if (ORIGINAL_AWS === undefined) delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  else process.env.PHI_AWS_PROCESSING_CONFIRMED = ORIGINAL_AWS;
}

test("AWS: unset flag is not confirmed — fail closed by default", () => {
  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  assert.equal(isPhiAwsProcessingConfirmed(), false);
  assert.throws(() => requirePhiAwsProcessingConfirmed(), /PHI_AWS_PROCESSING_CONFIRMED/);
  restoreAwsEnv();
});

test("AWS: any value other than the exact string 'true' is not confirmed", () => {
  for (const v of ["TRUE", "1", "yes", "True "]) {
    process.env.PHI_AWS_PROCESSING_CONFIRMED = v;
    assert.equal(isPhiAwsProcessingConfirmed(), false, `expected "${v}" to NOT confirm`);
  }
  restoreAwsEnv();
});

test("AWS: exact string 'true' confirms", () => {
  process.env.PHI_AWS_PROCESSING_CONFIRMED = "true";
  assert.equal(isPhiAwsProcessingConfirmed(), true);
  assert.doesNotThrow(() => requirePhiAwsProcessingConfirmed());
  restoreAwsEnv();
});

test("AWS and OpenAI gates are fully independent — confirming one never satisfies the other", () => {
  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  process.env.PHI_OPENAI_PROCESSING_CONFIRMED = "true";
  assert.equal(isPhiAwsProcessingConfirmed(), false);
  restoreAwsEnv();
  restoreEnv();

  delete process.env.PHI_OPENAI_PROCESSING_CONFIRMED;
  process.env.PHI_AWS_PROCESSING_CONFIRMED = "true";
  assert.equal(isPhiOpenAiProcessingConfirmed(), false);
  restoreAwsEnv();
  restoreEnv();
});

test("AWS: synthetic override requires its own PHI_SYNTHETIC_TEST_MODE value, same discipline as the OpenAI gate", () => {
  delete process.env.PHI_SYNTHETIC_TEST_MODE;
  process.env.PHI_AWS_PROCESSING_CONFIRMED = "true";
  assert.equal(isPhiAwsProcessingConfirmed({ syntheticTestOverride: true }), false);
  restoreAwsEnv();
  restoreSyntheticEnv();

  delete process.env.PHI_AWS_PROCESSING_CONFIRMED;
  process.env.PHI_SYNTHETIC_TEST_MODE = "synthetic-only-not-for-production";
  assert.equal(isPhiAwsProcessingConfirmed({ syntheticTestOverride: true }), true);
  restoreAwsEnv();
  restoreSyntheticEnv();
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
