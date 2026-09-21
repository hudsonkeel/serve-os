// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/coverageManifest.test.ts
import assert from "node:assert/strict";
import { buildSourceCoverageManifest } from "../coverageManifest.ts";
import type { ParsedDocument } from "../types.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function doc(overrides: Partial<ParsedDocument>): ParsedDocument {
  return {
    sourceType: "serve_pnp",
    title: "doc",
    sourceFilename: "doc.docx",
    sourcePath: "docs/doc.docx",
    sourceStatus: "current",
    operationalAuthority: "current_operating_policy",
    effectiveOrUpdatedDate: null,
    relatedSectionNumber: null,
    sourceMetadata: {},
    contentHash: "hash",
    sections: [],
    warnings: [],
    ...overrides,
  };
}

test("a section number present in both P&P and Texas PAS is not reported as a gap", () => {
  const manifest = buildSourceCoverageManifest(
    [
      doc({ sourceType: "serve_pnp", sections: [{ sectionNumber: "281", sectionTitle: "t", subsectionLabel: null, chunkIndex: 0, sortOrder: 0, bodyText: "b" }] }),
      doc({ sourceType: "texas_pas", sections: [{ sectionNumber: "281", sectionTitle: "t", subsectionLabel: null, chunkIndex: 0, sortOrder: 0, bodyText: "b" }] }),
    ],
    []
  );
  assert.equal(manifest.sectionNumberGaps.length, 0);
});

test("applies a known explanation for §297/§302/§251, and a generic needs-review note otherwise", () => {
  const manifest = buildSourceCoverageManifest(
    [
      doc({ sourceType: "serve_pnp", sections: [{ sectionNumber: "297", sectionTitle: "t", subsectionLabel: null, chunkIndex: 0, sortOrder: 0, bodyText: "b" }] }),
      doc({ sourceType: "texas_pas", sections: [{ sectionNumber: "999", sectionTitle: "t", subsectionLabel: null, chunkIndex: 0, sortOrder: 0, bodyText: "b" }] }),
    ],
    []
  );
  const g297 = manifest.sectionNumberGaps.find((g) => g.sectionNumber === "297")!;
  assert.match(g297.explanation!, /non-medical/);
  const g999 = manifest.sectionNumberGaps.find((g) => g.sectionNumber === "999")!;
  assert.match(g999.explanation!, /needs review/);
});

test("surfaces document warnings and deduplication notes", () => {
  const manifest = buildSourceCoverageManifest(
    [doc({ warnings: ["something happened"], sourceMetadata: { deduplication: [{ sectionNumber: "287" }] } })],
    [{ filename: "combined.pdf", reason: "redundant" }]
  );
  assert.equal(manifest.warnings.length, 1);
  assert.equal(manifest.deduplicationNotes.length, 1);
  assert.equal(manifest.excludedFiles.length, 1);
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
