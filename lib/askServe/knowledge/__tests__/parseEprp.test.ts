// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/parseEprp.test.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEprpDocx } from "../parseEprp.ts";

const EPRP_PATH = "docs/organizational-knowledge/controlled-procedures/Serve_Caregiving_EPRP_v0.3_Leadership_Review_Draft.docx";

type Test = { name: string; fn: () => Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

async function loadParsed() {
  const buffer = await readFile(EPRP_PATH);
  return parseEprpDocx(buffer, EPRP_PATH);
}

test("is classified as a draft controlled procedure, NOT binding — despite being the newest supplied file", async () => {
  const doc = await loadParsed();
  assert.equal(doc.sourceType, "serve_controlled_procedure");
  assert.equal(doc.sourceStatus, "draft_pending_review");
  assert.equal(doc.operationalAuthority, "pending_not_binding");
  assert.notEqual(doc.operationalAuthority, "current_operating_policy");
  assert.notEqual(doc.operationalAuthority, "binding_regulation");
});

test("records no effective date, since the source states none exists yet pending approval", async () => {
  const doc = await loadParsed();
  assert.equal(doc.effectiveOrUpdatedDate, null);
});

test("links to P&P/Texas PAS §256 via relatedSectionNumber, not via its own section numbering", async () => {
  const doc = await loadParsed();
  assert.equal(doc.relatedSectionNumber, "256");
  // Its own sections must be namespaced so "EPRP-1" can never be mistaken
  // for (or paired against) unrelated §558.1.
  for (const s of doc.sections) assert.match(s.sectionNumber, /^EPRP-/);
});

test("found the LEADERSHIP REVIEW DRAFT status banner (no warning raised)", async () => {
  const doc = await loadParsed();
  assert.equal(doc.warnings.length, 0);
  assert.equal(doc.sourceMetadata.statusBannerFound, true);
});

test("parses all 9 numbered Heading1 sections plus the two Heading2 sub-sections", async () => {
  const doc = await loadParsed();
  const numbers = doc.sections.map((s) => s.sectionNumber);
  for (const n of ["EPRP-1", "EPRP-2", "EPRP-3", "EPRP-4", "EPRP-4.1", "EPRP-4.2", "EPRP-5", "EPRP-6", "EPRP-7", "EPRP-8", "EPRP-9"]) {
    assert.ok(numbers.includes(n), `expected section ${n}`);
  }
});

test("contains the four emergency phases and client triage content", async () => {
  const doc = await loadParsed();
  const triage = doc.sections.find((s) => s.sectionNumber === "EPRP-4.1");
  assert.ok(triage);
  assert.match(triage!.bodyText, /ENHANCED SUPPORT/);
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
