// Pure-function tests for ../levenshtein.ts. Run with:
//   npm run test:residentIdentity
import assert from "node:assert/strict";
import { levenshteinDistance } from "../levenshtein.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. identical strings have distance 0", () => {
  assert.equal(levenshteinDistance("elliott", "elliott"), 0);
});

test("2. 'elliot' vs 'elliott' has distance 1 (one insertion)", () => {
  assert.equal(levenshteinDistance("elliot", "elliott"), 1);
});

test("3. 'susan' vs 'susan' (identical) is 0", () => {
  assert.equal(levenshteinDistance("susan", "susan"), 0);
});

test("4. empty string vs non-empty equals the non-empty string's length", () => {
  assert.equal(levenshteinDistance("", "abc"), 3);
  assert.equal(levenshteinDistance("abc", ""), 3);
});

test("5. completely different strings of the same length", () => {
  assert.equal(levenshteinDistance("cat", "dog"), 3);
});

test("6. a substitution counts as distance 1", () => {
  assert.equal(levenshteinDistance("batungbacal", "batungbatal"), 1);
});

// ─── Runner ──────────────────────────────────────────────────────────

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
