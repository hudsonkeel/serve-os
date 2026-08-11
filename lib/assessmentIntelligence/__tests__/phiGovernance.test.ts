import assert from "node:assert/strict";
import { isPhiOpenAiProcessingConfirmed, requirePhiOpenAiProcessingConfirmed } from "../phiGovernance.ts";

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
