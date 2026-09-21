// Live Bedrock verification for Ask Serve's answer synthesis layer —
// exercises the REAL production path: retrieveKnowledgeEvidence()
// (Slice 1, against the real Supabase project) -> synthesizeAskServeAnswer()
// (Slice 2, against the real Bedrock Claude Sonnet endpoint). No mock/
// stand-in client is used anywhere in this script — both imports are the
// exact functions app/ask-serve/page.tsx's server action
// (lib/actions/askServe.ts) calls, unmodified and un-wrapped.
//
// Read-only against Supabase (retrieveKnowledgeEvidence only ever
// SELECTs — see lib/data/knowledgeSections.ts). Writes nothing.
//
// Prints only what's safe to print: the resulting AskServeAnswer per
// question, and evidence/packet size counters. Never prints AWS/Supabase
// credentials, the system/user prompts sent to the model, or raw
// provider response envelopes.
//
// Run with:
//   AWS_PROFILE=serve-bedrock-dev node --env-file-if-exists=.env.local --experimental-strip-types --conditions=react-server scripts/verify-ask-serve-answer-synthesis.ts
import { retrieveKnowledgeEvidence } from "../lib/askServe/retrieval.ts";
import { synthesizeAskServeAnswer } from "../lib/askServe/answer/synthesize.ts";

const QUESTIONS = [
  "How often do we reassess a client?",
  "When is a caregiver supervisory visit required?",
  "What can a caregiver do when assisting with medications?",
  "What are Serve's emergency preparedness requirements?",
  "When must services begin after a client requests immediate service?",
  "Does Serve accept physician orders?",
  "What happens if a caregiver cannot cover an assigned shift?",
  "What background checks does Serve require?",
  "Does Serve pronounce death / what should a caregiver do if a client dies?",
  "What is the office WiFi password?",
];

function printAnswer(answer: Awaited<ReturnType<typeof synthesizeAskServeAnswer>>) {
  console.log(`supportStatus: ${answer.supportStatus}`);
  console.log(`answer: ${answer.answer}`);
  console.log(`operationalGuidance: ${answer.operationalGuidance ?? "(none)"}`);
  console.log(`importantNote: ${answer.importantNote ?? "(none)"}`);
  console.log(`citations (${answer.citations.length}):`);
  for (const c of answer.citations) {
    const label = c.subsectionLabel ? `${c.sectionTitle} — ${c.subsectionLabel}` : c.sectionTitle;
    console.log(`  - [${c.sourceType}] §${c.sectionNumber} ${label} | status=${c.sourceStatus} authority=${c.operationalAuthority}`);
  }
}

async function main() {
  console.log("Ask Serve — Live Answer Synthesis Verification");
  console.log("================================================\n");

  for (let i = 0; i < QUESTIONS.length; i++) {
    const question = QUESTIONS[i];
    console.log(`\n=== Q${i + 1}: ${question} ===`);

    const evidence = await retrieveKnowledgeEvidence(question, { limit: 10 });
    console.log(`retrieved evidence: ${evidence.length}`);

    if (evidence.length === 0) {
      console.log("Zero evidence retrieved -> synthesizeAskServeAnswer() will short-circuit to the deterministic");
      console.log("NOT_FOUND answer WITHOUT calling Bedrock (see lib/askServe/answer/synthesize.ts's own");
      console.log("`if (evidence.length === 0) return NOT_FOUND_ANSWER;` — no client, mock or real, is ever invoked).");
    }

    const startedAt = Date.now();
    const answer = await synthesizeAskServeAnswer(question, evidence);
    const elapsedMs = Date.now() - startedAt;

    console.log(`synthesis took ${elapsedMs}ms${evidence.length === 0 ? " (no model call — deterministic path)" : " (live Bedrock call)"}`);
    printAnswer(answer);
  }
}

main().catch((err) => {
  console.error("Verification failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
