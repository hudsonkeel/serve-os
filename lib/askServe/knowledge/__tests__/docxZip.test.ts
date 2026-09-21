// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/docxZip.test.ts
//
// Exercises the hand-rolled ZIP reader (docxZip.ts exists because Node has
// no built-in ZIP container parser — see its file header) against the
// real checked-in .docx source files, since a synthetic fixture would not
// prove anything about the actual ZIP structure these files use (Word's
// exact local/central-directory layout, compression method choices).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listZipEntries, readZipEntry } from "../docxZip.ts";

const PNP_PATH = "docs/organizational-knowledge/policies/1.Serve Caregiving Policies & Procedures.docx";

type Test = { name: string; fn: () => Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("lists the expected OOXML parts of a real .docx", async () => {
  const buffer = await readFile(PNP_PATH);
  const entries = listZipEntries(buffer);
  assert.ok(entries.includes("word/document.xml"), "missing word/document.xml");
  assert.ok(entries.includes("docProps/core.xml"), "missing docProps/core.xml");
  assert.ok(entries.includes("[Content_Types].xml"), "missing [Content_Types].xml");
});

test("extracts word/document.xml as well-formed, non-empty XML", async () => {
  const buffer = await readFile(PNP_PATH);
  const xml = readZipEntry(buffer, "word/document.xml").toString("utf8");
  assert.ok(xml.startsWith("<?xml"), "expected an XML declaration");
  assert.ok(xml.includes("<w:body"), "expected a Word document body element");
  assert.ok(xml.length > 10_000, `expected substantial content, got ${xml.length} bytes`);
});

test("throws a clear error for a non-existent entry rather than returning garbage", async () => {
  const buffer = await readFile(PNP_PATH);
  assert.throws(() => readZipEntry(buffer, "word/does-not-exist.xml"), /not found/);
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
