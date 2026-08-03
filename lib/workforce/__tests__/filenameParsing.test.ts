// node --experimental-strip-types --conditions=react-server lib/workforce/__tests__/filenameParsing.test.ts
import assert from "node:assert/strict";
import { parseBulkImportFilename } from "../filenameParsing.ts";

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("parses the mission's exact worked examples", () => {
  const emr = parseBulkImportFilename("Hudson Keel - EMR 7.2026.pdf");
  assert.equal(emr.suggestedCaregiverName, "Hudson Keel");
  assert.equal(emr.suggestedDocumentType, "emr_search");
  assert.equal(emr.suggestedDate, "2026-07-01");

  const nar = parseBulkImportFilename("Susan Akam - NAR 7.2026.pdf");
  assert.equal(nar.suggestedCaregiverName, "Susan Akam");
  assert.equal(nar.suggestedDocumentType, "nar_search");
  assert.equal(nar.suggestedDate, "2026-07-01");
});

test("is case-insensitive on the document type keyword", () => {
  const result = parseBulkImportFilename("Alex Rivera - nar 12.2026.pdf");
  assert.equal(result.suggestedDocumentType, "nar_search");
  assert.equal(result.suggestedDate, "2026-12-01");
});

test("returns null suggestions gracefully for an unrecognized filename shape", () => {
  const result = parseBulkImportFilename("scan0001.pdf");
  assert.equal(result.suggestedCaregiverName, null);
  assert.equal(result.suggestedDocumentType, null);
  assert.equal(result.suggestedDate, null);
});

test("never fabricates a date from an out-of-range month", () => {
  const result = parseBulkImportFilename("Pat Lee - NAR 13.2026.pdf");
  assert.equal(result.suggestedDate, null);
});

test("preserves the raw filename verbatim for audit purposes", () => {
  const result = parseBulkImportFilename("Weird Name Format.pdf");
  assert.equal(result.rawFilename, "Weird Name Format.pdf");
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
