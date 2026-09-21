// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/rankSections.test.ts
//
// Unit tests for the ranking/matching algorithm itself, against small,
// controlled synthetic fixtures — complements knowledgeQuestions.test.ts,
// which exercises the same function against the real corpus.
import assert from "node:assert/strict";
import { rankKnowledgeEvidence, type CorpusItem } from "../rankSections.ts";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function item(overrides: Partial<CorpusItem>): CorpusItem {
  return {
    sectionId: "id",
    documentId: "doc",
    sourceType: "serve_pnp",
    sourceTitle: "Serve P&P",
    sourceFilename: "pnp.docx",
    sourcePath: "docs/pnp.docx",
    sectionNumber: "100",
    sectionTitle: "Title",
    subsectionLabel: null,
    bodyText: "Body text.",
    sourceStatus: "current",
    operationalAuthority: "current_operating_policy",
    effectiveOrUpdatedDate: null,
    ...overrides,
  };
}

test("an explicit §-reference selects that section directly, regardless of wording", () => {
  const corpus = [
    item({ sectionId: "a", sectionNumber: "281", bodyText: "Reassessment content." }),
    item({ sectionId: "b", sectionNumber: "290", bodyText: "Totally unrelated backup content." }),
  ];
  const evidence = rankKnowledgeEvidence(corpus, "Tell me about §281 specifically, ignore everything else.");
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].citation.sectionId, "a");
  assert.equal(evidence[0].matchReason, "section_number_match");
  assert.equal(evidence[0].score, 1);
});

test("pairs a matched P&P section with its Texas PAS counterpart when one exists", () => {
  const corpus = [
    item({ sectionId: "pnp", sourceType: "serve_pnp", sectionNumber: "290", bodyText: "Backup caregiver plan and process." }),
    item({ sectionId: "tx", sourceType: "texas_pas", sectionNumber: "290", bodyText: "Backup services must be available." }),
  ];
  const evidence = rankKnowledgeEvidence(corpus, "backup caregiver plan and process");
  const sourceTypes = evidence.map((e) => e.citation.sourceType).sort();
  assert.deepEqual(sourceTypes, ["serve_pnp", "texas_pas"]);
  assert.ok(evidence.find((e) => e.citation.sectionId === "tx")!.matchReason === "cross_reference_pair");
});

test("never fabricates a cross-reference pair that doesn't exist in the corpus", () => {
  const corpus = [item({ sectionId: "pnp", sourceType: "serve_pnp", sectionNumber: "297", bodyText: "Serve does not accept physician orders." })];
  const evidence = rankKnowledgeEvidence(corpus, "Does Serve accept physician orders?");
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].citation.sourceType, "serve_pnp");
});

test("never pairs an EPRP or cross-referenced-statute section against an unrelated bare number", () => {
  const corpus = [
    item({ sectionId: "eprp1", sourceType: "serve_controlled_procedure", sectionNumber: "EPRP-1", bodyText: "purpose and scope of this EPRP" }),
    item({ sectionId: "tx1", sourceType: "texas_pas", sectionNumber: "1", bodyText: "purpose and scope of this chapter" }),
  ];
  const evidence = rankKnowledgeEvidence(corpus, "purpose and scope");
  // Both may independently match by text relevance, but EPRP-1 must never
  // trigger a cross_reference_pair for texas_pas "1" (different namespace).
  const pairMatches = evidence.filter((e) => e.matchReason === "cross_reference_pair");
  assert.equal(pairMatches.length, 0);
});

test("returns nothing for a question with no meaningful term overlap (out-of-scope)", () => {
  const corpus = [
    item({ sectionId: "a", sectionNumber: "281", sectionTitle: "Client Care Policies", bodyText: "Clients will be reassessed every 365 days." }),
  ];
  const evidence = rankKnowledgeEvidence(corpus, "What is the office WiFi password?");
  assert.equal(evidence.length, 0);
});

test("labels EPRP evidence as pending/not-binding even when it is the top match", () => {
  const corpus = [
    item({
      sectionId: "eprp",
      sourceType: "serve_controlled_procedure",
      sectionNumber: "EPRP-2",
      sectionTitle: "Leadership, Risk Assessment, and Four Emergency Phases",
      bodyText: "disaster coordinator risk assessment hazard vulnerability",
      sourceStatus: "draft_pending_review",
      operationalAuthority: "pending_not_binding",
    }),
  ];
  const evidence = rankKnowledgeEvidence(corpus, "disaster coordinator risk assessment");
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].citation.operationalAuthority, "pending_not_binding");
});

test("respects the limit option for text-relevance matches", () => {
  const corpus = Array.from({ length: 10 }, (_, i) =>
    item({ sectionId: `s${i}`, sectionNumber: String(100 + i), bodyText: "medication reminders and assistance with medications" })
  );
  const evidence = rankKnowledgeEvidence(corpus, "medication assistance", { limit: 3 });
  assert.equal(evidence.length, 3);
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
