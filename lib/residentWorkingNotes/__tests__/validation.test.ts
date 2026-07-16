// Pure-function tests for lib/residentWorkingNotes/validation.ts. Run with:
//   npm run test:residentWorkingNotes
import assert from "node:assert/strict";
import {
  normalizeWorkingNoteCategory,
  normalizeWorkingNoteContent,
  WORKING_NOTE_MAX_LENGTH,
} from "../validation.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("1. trims leading/trailing whitespace", () => {
  const result = normalizeWorkingNoteContent("  Trevor meeting Tuesday.  ");
  assert.equal(result.content, "Trevor meeting Tuesday.");
  assert.equal(result.error, undefined);
});

test("2. rejects an empty string", () => {
  const result = normalizeWorkingNoteContent("");
  assert.equal(result.content, undefined);
  assert.equal(result.error, "Working note cannot be blank.");
});

test("3. rejects whitespace-only content", () => {
  const result = normalizeWorkingNoteContent("   \n\t  ");
  assert.ok(result.error);
});

test("4. accepts content exactly at the max length", () => {
  const content = "a".repeat(WORKING_NOTE_MAX_LENGTH);
  const result = normalizeWorkingNoteContent(content);
  assert.equal(result.content, content);
  assert.equal(result.error, undefined);
});

test("5. rejects content one character past the max length", () => {
  const content = "a".repeat(WORKING_NOTE_MAX_LENGTH + 1);
  const result = normalizeWorkingNoteContent(content);
  assert.equal(result.content, undefined);
  assert.ok(result.error?.includes(String(WORKING_NOTE_MAX_LENGTH)));
});

test("6. normalizeWorkingNoteCategory treats empty string as no category", () => {
  assert.equal(normalizeWorkingNoteCategory(""), null);
});

test("7. normalizeWorkingNoteCategory accepts a known category", () => {
  assert.equal(normalizeWorkingNoteCategory("family"), "family");
});

test("8. normalizeWorkingNoteCategory rejects an unknown value", () => {
  assert.equal(normalizeWorkingNoteCategory("not-a-real-category"), null);
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
