// node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/storage.test.ts
import assert from "node:assert/strict";
import { validateDocumentFile, buildDocumentStoragePath, MAX_DOCUMENT_BYTES } from "../storage.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("validateDocumentFile accepts a well-formed PDF", () => {
  const result = validateDocumentFile({ size: 1024, type: "application/pdf", name: "nar-search.pdf" });
  assert.equal(result.ok, true);
});

test("validateDocumentFile rejects a non-PDF mime type even with a .pdf extension", () => {
  const result = validateDocumentFile({ size: 1024, type: "image/png", name: "nar-search.pdf" });
  assert.equal(result.ok, false);
});

test("validateDocumentFile rejects a non-.pdf extension even with a PDF mime type", () => {
  const result = validateDocumentFile({ size: 1024, type: "application/pdf", name: "nar-search.docx" });
  assert.equal(result.ok, false);
});

test("validateDocumentFile rejects an empty file", () => {
  const result = validateDocumentFile({ size: 0, type: "application/pdf", name: "empty.pdf" });
  assert.equal(result.ok, false);
});

test("validateDocumentFile rejects a file over the 10 MB limit", () => {
  const result = validateDocumentFile({ size: MAX_DOCUMENT_BYTES + 1, type: "application/pdf", name: "big.pdf" });
  assert.equal(result.ok, false);
});

test("buildDocumentStoragePath never includes the original filename", () => {
  const path = buildDocumentStoragePath({
    subjectType: "workforce_member",
    subjectId: "11111111-1111-1111-1111-111111111111",
    documentType: "nar_search",
    documentId: "22222222-2222-2222-2222-222222222222",
  });
  assert.equal(
    path,
    "workforce_member/11111111-1111-1111-1111-111111111111/nar_search/22222222-2222-2222-2222-222222222222.pdf"
  );
});

test("buildDocumentStoragePath sanitizes an unexpected documentType value", () => {
  const path = buildDocumentStoragePath({
    subjectType: "workforce_member",
    subjectId: "s1",
    documentType: "weird type/../with slashes",
    documentId: "d1",
  });
  assert.equal(path.includes("/../"), false);
  assert.equal(path, "workforce_member/s1/weird_type____with_slashes/d1.pdf");
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
