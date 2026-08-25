import assert from "node:assert/strict";
import {
  getConfiguredTranscriptionProvider,
  getConfiguredTranscriptionProviderKey,
  getTranscriptionProviderByProviderId,
  DEFAULT_TRANSCRIPTION_PROVIDER_ID,
} from "../transcriptionProviderSelection.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ORIGINAL = process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER;
function restoreEnv() {
  if (ORIGINAL === undefined) delete process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER;
  else process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = ORIGINAL;
}

test("unset -> the known-working default (openai) — not a statement that OpenAI is the intended production PHI path", () => {
  delete process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER;
  assert.equal(DEFAULT_TRANSCRIPTION_PROVIDER_ID, "openai");
  assert.equal(getConfiguredTranscriptionProviderKey(), "openai");
  const provider = getConfiguredTranscriptionProvider();
  assert.equal(provider.providerId, "openai");
  restoreEnv();
});

test("explicitly set to 'openai' selects the OpenAI provider", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "openai";
  assert.equal(getConfiguredTranscriptionProvider().providerId, "openai");
  restoreEnv();
});

test("explicitly set to 'aws' selects the AWS Transcribe provider", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "aws";
  assert.equal(getConfiguredTranscriptionProviderKey(), "aws");
  assert.equal(getConfiguredTranscriptionProvider().providerId, "aws-transcribe");
  restoreEnv();
});

test("NO SILENT FALLBACK: an unrecognized value throws rather than guessing a default", () => {
  process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER = "some-typo-value";
  assert.throws(() => getConfiguredTranscriptionProvider(), /Unknown ASSESSMENT_TRANSCRIPTION_PROVIDER/);
  restoreEnv();
});

test("getTranscriptionProviderByProviderId resolves by the provider's own self-reported id, not the config key", () => {
  assert.equal(getTranscriptionProviderByProviderId("openai").providerId, "openai");
  assert.equal(getTranscriptionProviderByProviderId("aws-transcribe").providerId, "aws-transcribe");
});

test("getTranscriptionProviderByProviderId throws for an unrecognized providerId rather than guessing", () => {
  assert.throws(() => getTranscriptionProviderByProviderId("some-unknown-provider"), /No known transcription provider/);
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
