// Live Supabase verification for the Ask Serve knowledge foundation —
// confirms the migration in
// supabase/migrations/20260920000000_create_ask_serve_knowledge_layer.sql
// and a completed `npm run knowledge:ingest` actually produce working,
// grounded retrieval end to end via the real Supabase-backed
// lib/askServe/retrieval.ts (not the in-process pure-ranking path
// lib/askServe/knowledge/__tests__/knowledgeQuestions.test.ts exercises
// without a database).
//
// Follows this codebase's established live-verification convention (see
// scripts/verify-audit-readiness-phase1a.ts) — read-only against real
// ingested data, no test rows created or deleted.
//
// Run with:
//   node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-ask-serve-knowledge-retrieval.ts
import { retrieveKnowledgeEvidence } from "../lib/askServe/retrieval.ts";
import { listKnowledgeDocuments } from "../lib/data/knowledgeDocuments.ts";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}`, detail ?? "");
  }
}

interface QuestionCheck {
  name: string;
  question: string;
  expect: (evidence: Awaited<ReturnType<typeof retrieveKnowledgeEvidence>>) => void;
}

const has = (evidence: Awaited<ReturnType<typeof retrieveKnowledgeEvidence>>, sourceType: string, sectionNumber: string) =>
  evidence.some((e) => e.citation.sourceType === sourceType && e.citation.sectionNumber === sectionNumber);

const QUESTIONS: QuestionCheck[] = [
  {
    name: "Q1 reassessment cadence",
    question: "How often do we need to reassess a PAS client?",
    expect: (e) => {
      if (!has(e, "serve_pnp", "281")) throw new Error("expected Serve P&P §281");
      if (!has(e, "texas_pas", "281")) throw new Error("expected Texas PAS §558.281");
    },
  },
  {
    name: "Q2 supervisory visits",
    question: "When is a supervisory visit required for a caregiver?",
    expect: (e) => {
      if (!has(e, "serve_pnp", "404")) throw new Error("expected Serve P&P §404");
      if (!has(e, "texas_pas", "404")) throw new Error("expected Texas PAS §558.404");
    },
  },
  {
    name: "Q3 medication assistance",
    question: "What can a caregiver do when assisting with medications?",
    expect: (e) => {
      const text = e.filter((x) => x.citation.sourceType === "serve_pnp").map((x) => x.excerpt).join(" ");
      if (!/self administration of medications/i.test(text)) throw new Error("expected allowed-assistance language");
      if (!/administration of any prescription medication/i.test(text)) throw new Error("expected prohibited-administration language");
    },
  },
  {
    name: "Q4 emergency preparedness",
    question: "What are our emergency preparedness requirements?",
    expect: (e) => {
      if (!has(e, "serve_pnp", "256")) throw new Error("expected Serve P&P §256");
      if (!has(e, "texas_pas", "256")) throw new Error("expected Texas PAS §558.256");
      const eprp = e.find((x) => x.citation.sourceType === "serve_controlled_procedure");
      if (!eprp) throw new Error("expected EPRP evidence");
      if (eprp.citation.operationalAuthority !== "pending_not_binding") throw new Error("EPRP must be labeled pending_not_binding");
    },
  },
  {
    name: "Q5 immediate initiation of services",
    question: "When must services begin after a client requests immediate service?",
    expect: (e) => {
      if (!has(e, "serve_pnp", "294")) throw new Error("expected Serve P&P §294");
      if (!has(e, "texas_pas", "294")) throw new Error("expected Texas PAS §558.294");
    },
  },
  {
    name: "Q6 physician orders",
    question: "Does Serve accept physician orders?",
    expect: (e) => {
      if (!has(e, "serve_pnp", "297")) throw new Error("expected Serve P&P §297");
      if (has(e, "texas_pas", "297")) throw new Error("must not fabricate Texas §558.297 — absent from this corpus");
    },
  },
  {
    name: "Q7 backup caregiver / missed shift",
    question: "What does Serve require if a caregiver cannot cover an assigned shift?",
    expect: (e) => {
      if (!has(e, "serve_pnp", "290")) throw new Error("expected Serve P&P §290");
      if (!has(e, "texas_pas", "290")) throw new Error("expected Texas PAS §558.290");
    },
  },
  {
    name: "Q8 background checks",
    question: "What background checks does Serve require before hiring?",
    expect: (e) => {
      if (!has(e, "serve_pnp", "245")) throw new Error("expected Serve P&P §245");
      if (!has(e, "texas_pas", "245")) throw new Error("expected Texas PAS §558.245");
      if (e.some((x) => x.citation.sourcePath.includes("background-eligibility"))) {
        throw new Error("must never surface draft Background Eligibility governance");
      }
    },
  },
  {
    name: "Q9 pronouncement of death",
    question: "What do we do regarding pronouncement of death for a client?",
    expect: (e) => {
      if (!has(e, "serve_pnp", "302")) throw new Error("expected Serve P&P §302");
      if (has(e, "texas_pas", "302")) throw new Error("must not fabricate Texas §558.302 — absent from this corpus");
    },
  },
  {
    name: "Q10 out-of-scope",
    question: "What is the office WiFi password?",
    expect: (e) => {
      if (e.length !== 0) throw new Error(`expected no evidence, got ${e.length}: ${e.map((x) => x.citation.sectionNumber).join(",")}`);
    },
  },
];

async function main() {
  console.log("Ask Serve Knowledge Retrieval — Live Verification");
  console.log("====================================================\n");

  console.log("== Ingested document inventory ==");
  const documents = await listKnowledgeDocuments();
  check("at least one document of each expected source_type is ingested", new Set(documents.map((d) => d.source_type)).size === 4, {
    sourceTypes: [...new Set(documents.map((d) => d.source_type))],
  });
  console.log(`  ${documents.length} document(s) ingested: ${JSON.stringify(documents.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.source_type]: (acc[d.source_type] ?? 0) + 1 }), {}))}`);

  console.log("\n== Retrieval questions ==");
  for (const q of QUESTIONS) {
    const evidence = await retrieveKnowledgeEvidence(q.question, { limit: 8 });
    try {
      q.expect(evidence);
      check(q.name, true);
    } catch (err) {
      check(q.name, false, err instanceof Error ? err.message : err);
      console.error(
        "  evidence returned:",
        evidence.map((e) => `${e.citation.sourceType}/${e.citation.sectionNumber} (${e.matchReason})`)
      );
    }
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Verification failed to run:", err instanceof Error ? err.message : err);
  process.exit(1);
});
