// node --experimental-strip-types --conditions=react-server lib/askServe/answer/__tests__/synthesize.test.ts
//
// No AWS credentials, network access, or real Bedrock calls anywhere in
// this file — a fake client is injected throughout, matching the
// established pattern in
// lib/assessmentIntelligence/backgroundCore/__tests__/bedrockClaudeProvider.test.ts.
import assert from "node:assert/strict";
import type { ConverseCommand, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import type { BedrockConverseClient } from "../../../ai/bedrockClaude.ts";
import { AskServeSynthesisProviderError, AskServeSynthesisValidationError, synthesizeAskServeAnswer } from "../synthesize.ts";
import type { KnowledgeEvidence } from "../../knowledge/types.ts";

type Test = { name: string; fn: () => Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function fakeClientReturningText(text: string): BedrockConverseClient {
  return {
    send: async (): Promise<ConverseCommandOutput> => ({
      output: { message: { role: "assistant", content: [{ text }] } },
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      metrics: { latencyMs: 0 },
      $metadata: {},
    }),
  };
}

function fakeClientThrowing(message: string): BedrockConverseClient {
  return {
    send: async () => {
      throw new Error(message);
    },
  };
}

function evidence(overrides: Partial<KnowledgeEvidence["citation"]> & { excerpt?: string } = {}): KnowledgeEvidence {
  const excerpt = overrides.excerpt ?? "Serve caregivers must do X.";
  return {
    citation: {
      documentId: "doc-1",
      sectionId: "sec-281",
      sourceType: "serve_pnp",
      sourceTitle: "Serve Caregiving Policies and Procedures",
      sourceFilename: "pnp.docx",
      sourcePath: "docs/pnp.docx",
      sectionNumber: "281",
      sectionTitle: "Client Care Policies",
      subsectionLabel: null,
      sourceStatus: "current",
      operationalAuthority: "current_operating_policy",
      effectiveOrUpdatedDate: "2026-08-24",
      ...overrides,
    },
    excerpt,
    matchReason: "text_relevance",
    score: 1,
  };
}

test("empty evidence returns the deterministic NOT_FOUND answer without ever calling the client", async () => {
  let called = false;
  const client: BedrockConverseClient = {
    send: async () => {
      called = true;
      return { output: { message: { role: "assistant", content: [{ text: "{}" }] } } } as ConverseCommandOutput;
    },
  };
  const answer = await synthesizeAskServeAnswer("anything", [], { client });
  assert.equal(called, false);
  assert.equal(answer.supportStatus, "not_found");
  assert.equal(answer.citations.length, 0);
});

test("successful grounded synthesis: valid response resolves citations from real evidence metadata", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(
    JSON.stringify({
      supportStatus: "supported",
      answer: "Serve requires X.",
      operationalGuidance: "Do X.",
      importantNote: null,
      citedEvidenceIds: ["sec-281"],
    })
  );
  const answer = await synthesizeAskServeAnswer("What does Serve require?", [ev], { client });
  assert.equal(answer.supportStatus, "supported");
  assert.equal(answer.citations.length, 1);
  assert.equal(answer.citations[0].evidenceId, "sec-281");
  assert.equal(answer.citations[0].sourceType, "serve_pnp");
  assert.equal(answer.citations[0].operationalAuthority, "current_operating_policy");
  assert.equal(answer.citations[0].excerpt, ev.excerpt);
});

test("citation metadata always comes from the real evidence record, never from the model — even if the model's prose implies otherwise", async () => {
  // The evidence is an EPRP (draft, pending_not_binding). Simulate a
  // misbehaving model that marks the answer "supported" anyway — the
  // returned citation's authority must still reflect the real record.
  const ev = evidence({
    sourceType: "serve_controlled_procedure",
    sourceTitle: "EPRP",
    sourceStatus: "draft_pending_review",
    operationalAuthority: "pending_not_binding",
    sectionNumber: "EPRP-2",
  });
  const client = fakeClientReturningText(
    JSON.stringify({
      supportStatus: "supported",
      answer: "Serve requires staff to follow the EPRP.",
      operationalGuidance: null,
      importantNote: null,
      citedEvidenceIds: ["sec-281"],
    })
  );
  const answer = await synthesizeAskServeAnswer("What are our emergency requirements?", [ev], { client });
  assert.equal(answer.citations[0].operationalAuthority, "pending_not_binding");
  assert.equal(answer.citations[0].sourceStatus, "draft_pending_review");
  // The model's own claim of "supported" is passed through as-is (this
  // module does not second-guess the model's support-status judgment),
  // but the CITATION METADATA is never laundered — that's the actual
  // structural guarantee under test here.
});

test("an invented/unknown evidence id is dropped, never rendered as a citation", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(
    JSON.stringify({
      supportStatus: "supported",
      answer: "Serve requires X.",
      operationalGuidance: null,
      importantNote: null,
      citedEvidenceIds: ["sec-281", "sec-does-not-exist"],
    })
  );
  const answer = await synthesizeAskServeAnswer("q", [ev], { client });
  assert.equal(answer.citations.length, 1);
  assert.equal(answer.citations[0].evidenceId, "sec-281");
});

test("fails safely when every cited evidence id is invented (zero real grounding survives)", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(
    JSON.stringify({
      supportStatus: "supported",
      answer: "Serve requires X.",
      operationalGuidance: null,
      importantNote: null,
      citedEvidenceIds: ["totally-invented-id"],
    })
  );
  await assert.rejects(() => synthesizeAskServeAnswer("q", [ev], { client }), AskServeSynthesisValidationError);
});

test("a JSON response wrapped in a markdown code fence is still parsed correctly (live-verified Claude behavior, 2026-09-21)", async () => {
  const ev = evidence();
  const fenced = "```json\n" + JSON.stringify({
    supportStatus: "supported",
    answer: "Serve requires X.",
    operationalGuidance: null,
    importantNote: null,
    citedEvidenceIds: ["sec-281"],
  }) + "\n```";
  const client = fakeClientReturningText(fenced);
  const answer = await synthesizeAskServeAnswer("q", [ev], { client });
  assert.equal(answer.supportStatus, "supported");
  assert.equal(answer.citations.length, 1);
});

test("not_found is allowed to have zero citations without failing", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(
    JSON.stringify({
      supportStatus: "not_found",
      answer: "The retrieved evidence does not address this.",
      operationalGuidance: null,
      importantNote: null,
      citedEvidenceIds: [],
    })
  );
  const answer = await synthesizeAskServeAnswer("q", [ev], { client });
  assert.equal(answer.supportStatus, "not_found");
  assert.equal(answer.citations.length, 0);
});

// ── Refinement 2: distinct-field-purpose / anti-repetition prompt change ──
// These prove the STRUCTURE the prompt change relies on still behaves
// correctly (importantNote stays a valid, optional field; a simple
// supported answer doesn't require one; draft/pending evidence can still
// produce one; citation/authority protections are untouched) — never
// brittle assertions on Sonnet's actual wording, which none of these
// tests depend on.

test("REFINEMENT 2: importantNote remains a valid, optional field in the schema — both null and populated pass validation", async () => {
  const ev = evidence();
  const withoutNote = fakeClientReturningText(
    JSON.stringify({ supportStatus: "supported", answer: "Serve requires X.", operationalGuidance: null, importantNote: null, citedEvidenceIds: ["sec-281"] })
  );
  const withNote = fakeClientReturningText(
    JSON.stringify({ supportStatus: "supported", answer: "Serve requires X.", operationalGuidance: null, importantNote: "A distinct qualification.", citedEvidenceIds: ["sec-281"] })
  );
  const a1 = await synthesizeAskServeAnswer("q", [ev], { client: withoutNote });
  const a2 = await synthesizeAskServeAnswer("q", [ev], { client: withNote });
  assert.equal(a1.importantNote, null);
  assert.equal(a2.importantNote, "A distinct qualification.");
});

test("REFINEMENT 2: a simple supported answer does not require an importantNote", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(
    JSON.stringify({ supportStatus: "supported", answer: "Serve requires X.", operationalGuidance: "Do X.", importantNote: null, citedEvidenceIds: ["sec-281"] })
  );
  const answer = await synthesizeAskServeAnswer("q", [ev], { client });
  assert.equal(answer.supportStatus, "supported");
  assert.equal(answer.importantNote, null);
});

test("REFINEMENT 2: operationalGuidance remains optional — a supported answer with none is still valid", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(
    JSON.stringify({ supportStatus: "supported", answer: "Serve requires X.", operationalGuidance: null, importantNote: null, citedEvidenceIds: ["sec-281"] })
  );
  const answer = await synthesizeAskServeAnswer("q", [ev], { client });
  assert.equal(answer.operationalGuidance, null);
});

test("REFINEMENT 2: draft/pending-not-binding evidence (e.g. the EPRP) can still appropriately produce an importantNote", async () => {
  const draftEv = evidence({
    sourceType: "serve_controlled_procedure",
    sourceTitle: "EPRP",
    sourceStatus: "draft_pending_review",
    operationalAuthority: "pending_not_binding",
    sectionNumber: "EPRP-5",
  });
  const client = fakeClientReturningText(
    JSON.stringify({
      supportStatus: "partially_supported",
      answer: "Serve P&P references a separate EPRP for detailed emergency procedures.",
      operationalGuidance: null,
      importantNote: "The detailed EPRP is still in leadership review and is not yet binding.",
      citedEvidenceIds: ["sec-281"],
    })
  );
  const answer = await synthesizeAskServeAnswer("q", [draftEv], { client });
  assert.equal(answer.supportStatus, "partially_supported");
  assert.match(answer.importantNote ?? "", /not yet binding|pending|draft/i);
  // The prompt change must never loosen the existing authority protection:
  // the citation's own operationalAuthority still comes from the real
  // evidence record, not from the model's importantNote text.
  assert.equal(answer.citations[0].operationalAuthority, "pending_not_binding");
});

test("REFINEMENT 2: citation/authority protections are unchanged by the prompt update — an invented citation id is still dropped", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(
    JSON.stringify({
      supportStatus: "supported",
      answer: "Serve requires X.",
      operationalGuidance: null,
      importantNote: "Some note.",
      citedEvidenceIds: ["sec-281", "sec-invented"],
    })
  );
  const answer = await synthesizeAskServeAnswer("q", [ev], { client });
  assert.equal(answer.citations.length, 1);
  assert.equal(answer.citations[0].evidenceId, "sec-281");
});

test("partially_supported and needs_review pass through structurally unchanged", async () => {
  const ev = evidence();
  for (const status of ["partially_supported", "needs_review"] as const) {
    const client = fakeClientReturningText(
      JSON.stringify({
        supportStatus: status,
        answer: "Some answer.",
        operationalGuidance: null,
        importantNote: "A caveat.",
        citedEvidenceIds: ["sec-281"],
      })
    );
    const answer = await synthesizeAskServeAnswer("q", [ev], { client });
    assert.equal(answer.supportStatus, status);
    assert.equal(answer.importantNote, "A caveat.");
  }
});

test("provider failure surfaces as AskServeSynthesisProviderError, never a fallback answer", async () => {
  const ev = evidence();
  const client = fakeClientThrowing("ThrottlingException: rate exceeded");
  await assert.rejects(() => synthesizeAskServeAnswer("q", [ev], { client }), AskServeSynthesisProviderError);
});

test("non-JSON model output fails as a validation error, never renders partial prose", async () => {
  const ev = evidence();
  const client = fakeClientReturningText("Sure! Here's my answer: Serve requires...");
  await assert.rejects(() => synthesizeAskServeAnswer("q", [ev], { client }), AskServeSynthesisValidationError);
});

test("JSON missing required fields fails as a validation error", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(JSON.stringify({ supportStatus: "supported" }));
  await assert.rejects(() => synthesizeAskServeAnswer("q", [ev], { client }), AskServeSynthesisValidationError);
});

test("an invalid supportStatus value fails validation", async () => {
  const ev = evidence();
  const client = fakeClientReturningText(
    JSON.stringify({ supportStatus: "very_confident", answer: "x", citedEvidenceIds: [] })
  );
  await assert.rejects(() => synthesizeAskServeAnswer("q", [ev], { client }), AskServeSynthesisValidationError);
});

test("evidence packet caps excerpt length with a visible truncation marker", async () => {
  const longExcerpt = "A".repeat(5000);
  const ev = evidence({ excerpt: longExcerpt });
  let capturedUserPrompt = "";
  const client: BedrockConverseClient = {
    send: async (cmd: ConverseCommand) => {
      capturedUserPrompt = (cmd.input?.messages?.[0]?.content?.[0] as { text?: string } | undefined)?.text ?? "";
      return { output: { message: { role: "assistant", content: [{ text: JSON.stringify({ supportStatus: "supported", answer: "x", citedEvidenceIds: ["sec-281"] }) }] } } } as ConverseCommandOutput;
    },
  };
  await synthesizeAskServeAnswer("q", [ev], { client });
  assert.ok(capturedUserPrompt.includes("truncated for length"));
  assert.ok(!capturedUserPrompt.includes("A".repeat(5000)));
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
