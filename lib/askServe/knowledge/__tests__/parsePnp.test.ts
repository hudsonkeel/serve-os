// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/parsePnp.test.ts
//
// Parses the real, checked-in Serve P&P source (not a synthetic fixture —
// the whole point is proving the actual current corpus parses correctly)
// and asserts on its known structure and content, established during
// source validation.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePnpDocx } from "../parsePnp.ts";

const PNP_PATH = "docs/organizational-knowledge/policies/1.Serve Caregiving Policies & Procedures.docx";

type Test = { name: string; fn: () => Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

async function loadParsed() {
  const buffer = await readFile(PNP_PATH);
  return parsePnpDocx(buffer, PNP_PATH);
}

test("identifies as current Serve operating policy, per source (no draft marker present)", async () => {
  const doc = await loadParsed();
  assert.equal(doc.sourceType, "serve_pnp");
  assert.equal(doc.sourceStatus, "current");
  assert.equal(doc.operationalAuthority, "current_operating_policy");
});

test("reads the footer's 'Updated: 8/24/2026' as the effective/updated date", async () => {
  const doc = await loadParsed();
  assert.equal(doc.effectiveOrUpdatedDate, "2026-08-24");
});

test("finds all 28 expected §-numbered sections after deduplication, with no false-positive duplicate warnings", async () => {
  const doc = await loadParsed();
  const uniqueNumbers = new Set(doc.sections.map((s) => s.sectionNumber));
  assert.equal(uniqueNumbers.size, 28, `expected 28 unique section numbers, got ${uniqueNumbers.size}: ${[...uniqueNumbers].sort().join(",")}`);
  // §245's "Lead Caregiver" and "Caregiver" job descriptions legitimately
  // repeat identical duty bullets (Medication Reminders, Pet Care, etc.)
  // — this must never be reported as a duplicate-section warning.
  assert.ok(!doc.warnings.some((w) => w.includes("§245")), "an unexpected §245 warning was raised — likely a deduplication false positive");
});

test("detects and resolves the known §287 duplication, preferring the QAPI-embedded copy", async () => {
  const doc = await loadParsed();
  const section287 = doc.sections.filter((s) => s.sectionNumber === "287");
  // Exactly one primary (chunkIndex 0) chunk should survive for §287.
  const primaries287 = section287.filter((s) => s.chunkIndex === 0);
  assert.equal(primaries287.length, 1, "expected exactly one surviving primary chunk for §287 after deduplication");
  assert.equal(primaries287[0].sectionTitle, "Quality Assessment and Performance Improvement");

  assert.equal(doc.warnings.length, 1);
  assert.match(doc.warnings[0], /§287 occurs twice/);
  assert.match(doc.warnings[0], /dropped/);

  const note = doc.sourceMetadata.deduplication as Record<string, unknown>[];
  assert.equal(note.length, 1);
  assert.equal(note[0].resolution, "auto_deduplicated_materially_equivalent");
});

test("preserves the parent section number on every sub-chunk of a large section", async () => {
  const doc = await loadParsed();
  const s245Chunks = doc.sections.filter((s) => s.sectionNumber === "245");
  assert.ok(s245Chunks.length > 3, "expected §245 to be split into multiple sub-chunks");
  for (const chunk of s245Chunks) assert.equal(chunk.sectionNumber, "245");
  assert.ok(s245Chunks.some((c) => c.subsectionLabel === "Not Hirable"));
  assert.ok(s245Chunks.some((c) => c.subsectionLabel === "JOB DESCRIPTIONS"));
});

test("contains the reassessment cadence somewhere under §281 (its primary chunk is empty — heading immediately followed by a sub-heading — and is dropped by design)", async () => {
  const doc = await loadParsed();
  const s281Chunks = doc.sections.filter((s) => s.sectionNumber === "281");
  assert.ok(s281Chunks.length > 0, "expected at least one §281 chunk");
  assert.ok(!s281Chunks.some((s) => s.subsectionLabel === null), "§281's empty primary chunk should have been dropped");
  assert.ok(s281Chunks.some((s) => /reassessed every 365 days/i.test(s.bodyText)));
});

test("contains the clean non-applicability statement in §297 (physician orders)", async () => {
  const doc = await loadParsed();
  const s297 = doc.sections.find((s) => s.sectionNumber === "297");
  assert.ok(s297);
  assert.match(s297!.bodyText, /does not accept physician orders/i);
});

test("contains the clean non-applicability statement in §302 (pronouncement of death)", async () => {
  const doc = await loadParsed();
  const s302 = doc.sections.find((s) => s.sectionNumber === "302");
  assert.ok(s302);
  assert.match(s302!.bodyText, /does not pronounce death/i);
});

test("contains the backup-caregiver procedure in §290", async () => {
  const doc = await loadParsed();
  const s290 = doc.sections.find((s) => s.sectionNumber === "290");
  assert.ok(s290);
  assert.match(s290!.bodyText, /unable to work their assigned shift/i);
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
