// node --experimental-strip-types --conditions=react-server lib/askServe/answer/__tests__/inputValidation.test.ts
import assert from "node:assert/strict";
import { looksClientSpecific, validateAskServeQuestion, MAX_QUESTION_LENGTH } from "../inputValidation.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("accepts a normal question, trimmed", () => {
  const result = validateAskServeQuestion("  How often do we reassess a client?  ");
  assert.deepEqual(result, { ok: true, question: "How often do we reassess a client?" });
});

test("rejects an empty or whitespace-only question", () => {
  assert.equal(validateAskServeQuestion("").ok, false);
  assert.equal(validateAskServeQuestion("   ").ok, false);
  assert.equal(validateAskServeQuestion(null).ok, false);
  assert.equal(validateAskServeQuestion(undefined).ok, false);
});

test("rejects a question shorter than the minimum length", () => {
  const result = validateAskServeQuestion("hi");
  assert.equal(result.ok, false);
});

test("rejects a question longer than the maximum length", () => {
  const tooLong = "a".repeat(MAX_QUESTION_LENGTH + 1);
  const result = validateAskServeQuestion(tooLong);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /limited to/);
});

test("accepts a question at exactly the maximum length", () => {
  const exact = "a".repeat(MAX_QUESTION_LENGTH);
  assert.equal(validateAskServeQuestion(exact).ok, true);
});

test("detects a client-specific question ('resident/client <Name>')", () => {
  assert.equal(looksClientSpecific("Tell me about resident Johnson's care plan"), true);
  assert.equal(looksClientSpecific("What does client Sarah Williams need?"), true);
});

test("does not flag an ordinary policy question as client-specific", () => {
  assert.equal(looksClientSpecific("How often do we reassess a client?"), false);
  assert.equal(looksClientSpecific("What can a caregiver do when assisting with medications?"), false);
  assert.equal(looksClientSpecific("Does Serve accept physician orders?"), false);
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
