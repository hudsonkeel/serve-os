// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/parseTexasPas.test.ts
import assert from "node:assert/strict";
import { parseTexasPasCorpus, parseTexasPasFilename } from "../parseTexasPas.ts";

const REGULATIONS_DIR = "docs/organizational-knowledge/regulations/texas-pas";

type Test = { name: string; fn: () => Promise<void> | void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

test("parses a plain §558.NNN filename", () => {
  const parsed = parseTexasPasFilename("§558.245_TxReg_Staffing Policies.pdf");
  assert.deepEqual(parsed, { bareSectionNumber: "245", crossReferencedStatute: null, titleFromFilename: "Staffing Policies" });
});

test("parses the §558.255/Occupations Code cross-reference filename", () => {
  const parsed = parseTexasPasFilename("§558.255_102.001_TxReg_Prohibition of Solicitation of Patients.pdf");
  assert.deepEqual(parsed, { bareSectionNumber: "255", crossReferencedStatute: "102.001", titleFromFilename: "Prohibition of Solicitation of Patients" });
});

test("returns null for a filename that doesn't match the expected shape", () => {
  assert.equal(parseTexasPasFilename("some-other-file.pdf"), null);
});

test("excludes the combined/omnibus PDF from the ingested corpus", async () => {
  const { documents, excluded } = await parseTexasPasCorpus(REGULATIONS_DIR);
  assert.ok(documents.every((d) => !d.sourceFilename.includes("(combined)")));
  const excludedCombined = excluded.find((e) => e.filename.includes("(combined)"));
  assert.ok(excludedCombined, "expected the combined PDF to be recorded as excluded");
  assert.match(excludedCombined!.reason, /redundant/);
});

test("parses exactly 40 individual §558 regulation documents plus 1 Occupations Code cross-reference", async () => {
  const { documents } = await parseTexasPasCorpus(REGULATIONS_DIR);
  const regs = documents.filter((d) => d.sourceType === "texas_pas");
  const crossRefs = documents.filter((d) => d.sourceType === "texas_statute_cross_reference");
  assert.equal(regs.length, 40, `expected 40 texas_pas documents, got ${regs.length}`);
  assert.equal(crossRefs.length, 1);
  assert.equal(crossRefs[0].relatedSectionNumber, "255");
  assert.match(crossRefs[0].sections[0].sectionNumber, /^OCC-/);
});

test("every regulation document has exactly one section (one PDF = one section, no further chunking)", async () => {
  const { documents } = await parseTexasPasCorpus(REGULATIONS_DIR);
  for (const d of documents.filter((d) => d.sourceType === "texas_pas")) {
    assert.equal(d.sections.length, 1, `expected exactly 1 section for ${d.sourceFilename}`);
  }
});

test("does not split the unusually long §558.2 Definitions section", async () => {
  const { documents } = await parseTexasPasCorpus(REGULATIONS_DIR);
  const definitions = documents.find((d) => d.sections[0]?.sectionNumber === "2");
  assert.ok(definitions);
  assert.equal(definitions!.sections.length, 1);
  assert.ok(definitions!.sections[0].bodyText.length > 10_000, "expected the full, unsplit Definitions text");
});

test("§558.245 contains the criminal history / NAR / EMR procedure requirement", async () => {
  const { documents } = await parseTexasPasCorpus(REGULATIONS_DIR);
  const s245 = documents.find((d) => d.sections[0]?.sectionNumber === "245");
  assert.ok(s245);
  assert.match(s245!.sections[0].bodyText, /criminal history checks/i);
});

test("has no §558.251, §558.297, or §558.302 documents (known, intentional gaps — see the coverage manifest)", async () => {
  const { documents } = await parseTexasPasCorpus(REGULATIONS_DIR);
  const regNumbers = new Set(documents.filter((d) => d.sourceType === "texas_pas").map((d) => d.sections[0].sectionNumber));
  assert.ok(!regNumbers.has("251"));
  assert.ok(!regNumbers.has("297"));
  assert.ok(!regNumbers.has("302"));
});

test("extracts the 'as in effect on' watermark as each regulation's effective date", async () => {
  const { documents } = await parseTexasPasCorpus(REGULATIONS_DIR);
  const s210 = documents.find((d) => d.sections[0]?.sectionNumber === "210");
  assert.ok(s210);
  assert.equal(s210!.effectiveOrUpdatedDate, "2026-08-23");
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
