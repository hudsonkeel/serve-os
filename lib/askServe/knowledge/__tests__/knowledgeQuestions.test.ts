// node --experimental-strip-types --conditions=react-server lib/askServe/knowledge/__tests__/knowledgeQuestions.test.ts
//
// Exercises the shared ranking/matching logic (rankSections.ts) against
// the REAL, full, checked-in source corpus — parsed the same way
// ingestion would parse it, with no database involved — for the 10
// representative questions specified for this slice. This is retrieval
// validation, not answer generation: every assertion is about which
// evidence comes back and with what provenance, never about prose.
//
// Why this substitutes for a live database run: this sandboxed
// environment has no Supabase credentials/instance available, and this
// codebase's own convention (see lib/data/knowledgeDocuments.ts's header
// comment) is that DB-touching orchestration is live-verified, not unit-
// mocked. This file exercises the actual ranking algorithm retrieval.ts
// delegates to, over the actual corpus content — the part of "does
// retrieval work" that does not require a live database to prove.
// scripts/verify-ask-serve-knowledge-retrieval.ts exercises the same 10
// questions against the real Supabase-backed retrieveKnowledgeEvidence
// once credentials are available.
import assert from "node:assert/strict";
import { rankKnowledgeEvidence } from "../rankSections.ts";
import type { KnowledgeEvidence } from "../types.ts";
import { loadRealCorpus } from "./testCorpus.ts";

type Test = { name: string; fn: () => Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function hasSection(evidence: KnowledgeEvidence[], sourceType: string, sectionNumber: string): boolean {
  return evidence.some((e) => e.citation.sourceType === sourceType && e.citation.sectionNumber === sectionNumber);
}

test("Q1 reassessment cadence: retrieves Serve P&P §281 and pairs it with Texas §558.281", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "How often do we need to reassess a PAS client?");
  assert.ok(hasSection(evidence, "serve_pnp", "281"), "expected Serve P&P §281");
  assert.ok(hasSection(evidence, "texas_pas", "281"), "expected Texas PAS §558.281 cross-reference pair");
  const pnp281 = evidence.find((e) => e.citation.sourceType === "serve_pnp" && e.citation.sectionNumber === "281")!;
  assert.match(pnp281.excerpt, /365 days/);
});

test("Q2 caregiver supervisory visits: retrieves Serve P&P §404 paired with Texas §558.404", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "When is a supervisory visit required for a caregiver?");
  assert.ok(hasSection(evidence, "serve_pnp", "404"), "expected Serve P&P §404");
  assert.ok(hasSection(evidence, "texas_pas", "404"), "expected Texas PAS §558.404 cross-reference pair");
});

test("Q3 medication assistance: preserves the assist-vs-administer distinction", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "What can a caregiver do when assisting with medications?", { limit: 8 });
  const pnpEvidence = evidence.filter((e) => e.citation.sourceType === "serve_pnp");
  assert.ok(pnpEvidence.length > 0, "expected at least one Serve P&P evidence item");
  const allText = pnpEvidence.map((e) => e.excerpt).join(" ");
  assert.match(allText, /self administration of medications/i, "expected the allowed-assistance language to be retrievable");
  assert.match(allText, /administration of any prescription medication/i, "expected the prohibited-administration language to be retrievable");
});

test("Q4 emergency preparedness: retrieves Serve P&P §256, Texas §558.256, AND the EPRP — each with distinct, honest status", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "What are our emergency preparedness requirements?", { limit: 8 });
  assert.ok(hasSection(evidence, "serve_pnp", "256"), "expected Serve P&P §256");
  assert.ok(hasSection(evidence, "texas_pas", "256"), "expected Texas PAS §558.256");
  const eprp = evidence.find((e) => e.citation.sourceType === "serve_controlled_procedure");
  assert.ok(eprp, "expected EPRP evidence to be retrievable despite its draft status");
  assert.equal(eprp!.citation.operationalAuthority, "pending_not_binding", "EPRP must never be labeled binding");
  assert.equal(eprp!.citation.sourceStatus, "draft_pending_review");

  const pnp256 = evidence.find((e) => e.citation.sourceType === "serve_pnp" && e.citation.sectionNumber === "256")!;
  assert.equal(pnp256.citation.operationalAuthority, "current_operating_policy");
  const texas256 = evidence.find((e) => e.citation.sourceType === "texas_pas" && e.citation.sectionNumber === "256")!;
  assert.equal(texas256.citation.operationalAuthority, "binding_regulation");
});

test("Q5 immediate initiation of services: retrieves Serve P&P §294 paired with Texas §558.294", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "When must services begin after a client requests immediate service?");
  assert.ok(hasSection(evidence, "serve_pnp", "294"), "expected Serve P&P §294");
  assert.ok(hasSection(evidence, "texas_pas", "294"), "expected Texas PAS §558.294 cross-reference pair");
  const pnp294 = evidence.find((e) => e.citation.sourceType === "serve_pnp" && e.citation.sectionNumber === "294")!;
  assert.match(pnp294.excerpt, /5 days/);
});

test("Q6 physician orders: retrieves Serve P&P §297 and never fabricates a Texas §558.297 citation", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "Does Serve accept physician orders?");
  assert.ok(hasSection(evidence, "serve_pnp", "297"), "expected Serve P&P §297");
  assert.ok(!hasSection(evidence, "texas_pas", "297"), "must not fabricate a Texas §558.297 citation — it does not exist in this corpus");
  const pnp297 = evidence.find((e) => e.citation.sourceType === "serve_pnp" && e.citation.sectionNumber === "297")!;
  assert.match(pnp297.excerpt, /does not accept physician orders/i);
});

test("Q7 backup caregiver / missed shift: retrieves Serve P&P §290 paired with Texas §558.290", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "What does Serve require if a caregiver cannot cover an assigned shift?");
  assert.ok(hasSection(evidence, "serve_pnp", "290"), "expected Serve P&P §290");
  assert.ok(hasSection(evidence, "texas_pas", "290"), "expected Texas PAS §558.290 cross-reference pair");
});

test("Q8 background checks: retrieves Serve P&P §245 paired with Texas §558.245, and never surfaces draft Background Eligibility governance", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "What background checks does Serve require before hiring?", { limit: 8 });
  assert.ok(hasSection(evidence, "serve_pnp", "245"), "expected Serve P&P §245");
  assert.ok(hasSection(evidence, "texas_pas", "245"), "expected Texas PAS §558.245 cross-reference pair");
  // Background Eligibility governance was never ingested into this corpus
  // (out of scope for this slice) — structurally guaranteed, asserted
  // here as an explicit, permanent guard against it ever being added to
  // retrieval scope silently in the future.
  assert.ok(evidence.every((e) => !e.citation.sourcePath.includes("background-eligibility")));
});

test("Q9 pronouncement of death: retrieves Serve P&P §302 and never fabricates a Texas §558.302 citation", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "What do we do regarding pronouncement of death for a client?");
  assert.ok(hasSection(evidence, "serve_pnp", "302"), "expected Serve P&P §302");
  assert.ok(!hasSection(evidence, "texas_pas", "302"), "must not fabricate a Texas §558.302 citation — it does not exist in this corpus");
});

test("Q10 out-of-scope question: returns no evidence rather than an irrelevant guess", async () => {
  const corpus = await loadRealCorpus();
  const evidence = rankKnowledgeEvidence(corpus, "What is the office WiFi password?");
  assert.equal(evidence.length, 0, `expected no evidence for an out-of-scope question, got ${evidence.length}: ${evidence.map((e) => e.citation.sectionNumber).join(",")}`);
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
