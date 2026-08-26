// Pure-function tests for lib/qapi/noteValidation.ts — mirrors
// lib/residentCurrentNeeds/__tests__/validation.test.ts's coverage exactly,
// against this table's own (shorter) max length.
//
//   node --experimental-strip-types --conditions=react-server lib/qapi/__tests__/noteValidation.test.ts
import assert from "node:assert/strict";
import { normalizeQapiDomainNoteContent, QAPI_DOMAIN_NOTE_MAX_LENGTH } from "../noteValidation.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("trims leading/trailing whitespace", () => {
  const result = normalizeQapiDomainNoteContent("  Revising the P&P to make EPRP its own governed document.  ");
  assert.equal(result.content, "Revising the P&P to make EPRP its own governed document.");
  assert.equal(result.error, undefined);
});

test("rejects an empty string", () => {
  const result = normalizeQapiDomainNoteContent("");
  assert.equal(result.content, undefined);
  assert.equal(result.error, "The note cannot be blank.");
});

test("rejects whitespace-only content", () => {
  const result = normalizeQapiDomainNoteContent("   \n\t  ");
  assert.equal(result.content, undefined);
  assert.ok(result.error);
});

test("accepts content exactly at the max length", () => {
  const content = "a".repeat(QAPI_DOMAIN_NOTE_MAX_LENGTH);
  const result = normalizeQapiDomainNoteContent(content);
  assert.equal(result.content, content);
  assert.equal(result.error, undefined);
});

test("rejects content one character past the max length", () => {
  const content = "a".repeat(QAPI_DOMAIN_NOTE_MAX_LENGTH + 1);
  const result = normalizeQapiDomainNoteContent(content);
  assert.equal(result.content, undefined);
  assert.ok(result.error?.includes(String(QAPI_DOMAIN_NOTE_MAX_LENGTH)));
});

test("preserves internal line breaks", () => {
  const result = normalizeQapiDomainNoteContent("Collecting outstanding documentation.\nScheduling supervisory visits.\n");
  assert.equal(result.content, "Collecting outstanding documentation.\nScheduling supervisory visits.");
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
