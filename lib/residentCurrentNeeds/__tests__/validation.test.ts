// Pure-function tests for lib/residentCurrentNeeds/validation.ts. Run with:
//   npm run test:residentCurrentNeeds
import assert from "node:assert/strict";
import {
  normalizeResidentCurrentNeedsContent,
  RESIDENT_CURRENT_NEEDS_MAX_LENGTH,
} from "../validation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. trims leading/trailing whitespace", () => {
  const result = normalizeResidentCurrentNeedsContent("  Needs a walker.  ");
  assert.equal(result.content, "Needs a walker.");
  assert.equal(result.error, undefined);
});

test("2. rejects an empty string", () => {
  const result = normalizeResidentCurrentNeedsContent("");
  assert.equal(result.content, undefined);
  assert.equal(result.error, "Current needs cannot be blank.");
});

test("3. rejects whitespace-only content", () => {
  const result = normalizeResidentCurrentNeedsContent("   \n\t  ");
  assert.equal(result.content, undefined);
  assert.ok(result.error);
});

test("4. accepts content exactly at the max length", () => {
  const content = "a".repeat(RESIDENT_CURRENT_NEEDS_MAX_LENGTH);
  const result = normalizeResidentCurrentNeedsContent(content);
  assert.equal(result.content, content);
  assert.equal(result.error, undefined);
});

test("5. rejects content one character past the max length", () => {
  const content = "a".repeat(RESIDENT_CURRENT_NEEDS_MAX_LENGTH + 1);
  const result = normalizeResidentCurrentNeedsContent(content);
  assert.equal(result.content, undefined);
  assert.ok(result.error?.includes(String(RESIDENT_CURRENT_NEEDS_MAX_LENGTH)));
});

test("6. preserves internal line breaks", () => {
  const result = normalizeResidentCurrentNeedsContent(
    "Line one.\nLine two.\n"
  );
  assert.equal(result.content, "Line one.\nLine two.");
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
