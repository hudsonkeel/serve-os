import assert from "node:assert/strict";
import { getConfiguredExtractionProvider, DEFAULT_EXTRACTION_PROVIDER_ID } from "../providerSelection.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

const ORIGINAL = process.env.ASSESSMENT_EXTRACTION_PROVIDER;
function restoreEnv() {
  if (ORIGINAL === undefined) delete process.env.ASSESSMENT_EXTRACTION_PROVIDER;
  else process.env.ASSESSMENT_EXTRACTION_PROVIDER = ORIGINAL;
}

test("unset -> the known-safe default (openai), not silently something else", () => {
  delete process.env.ASSESSMENT_EXTRACTION_PROVIDER;
  assert.equal(DEFAULT_EXTRACTION_PROVIDER_ID, "openai");
  const provider = getConfiguredExtractionProvider();
  assert.equal(provider.providerId, "openai");
  restoreEnv();
});

test("explicitly set to 'openai' selects the OpenAI provider", () => {
  process.env.ASSESSMENT_EXTRACTION_PROVIDER = "openai";
  const provider = getConfiguredExtractionProvider();
  assert.equal(provider.providerId, "openai");
  restoreEnv();
});

test("explicitly set to 'bedrock' selects the Bedrock Claude provider", () => {
  process.env.ASSESSMENT_EXTRACTION_PROVIDER = "bedrock";
  const provider = getConfiguredExtractionProvider();
  assert.equal(provider.providerId, "bedrock-claude");
  restoreEnv();
});

test("NO SILENT FALLBACK: an unrecognized value throws rather than guessing a default", () => {
  process.env.ASSESSMENT_EXTRACTION_PROVIDER = "some-typo-value";
  assert.throws(() => getConfiguredExtractionProvider(), /Unknown ASSESSMENT_EXTRACTION_PROVIDER/);
  restoreEnv();
});

test("provider objects returned are stable/consistent (same providerId/modelId across calls)", () => {
  process.env.ASSESSMENT_EXTRACTION_PROVIDER = "bedrock";
  const a = getConfiguredExtractionProvider();
  const b = getConfiguredExtractionProvider();
  assert.equal(a.providerId, b.providerId);
  assert.equal(a.modelId, b.modelId);
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
