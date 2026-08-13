import assert from "node:assert/strict";
import { extractFactsViaBedrockClaude, bedrockClaudeExtractionProvider, BEDROCK_REGION, BEDROCK_MODEL_ID, type BedrockConverseClient } from "../providers/bedrockClaudeProvider.ts";

// No AWS credentials, network access, or real Bedrock calls are used anywhere in this file — a
// fake client is injected throughout, matching how extractFactsViaBedrockClaude is designed to
// be tested (docs/architecture/BEDROCK_CLAUDE_PROVIDER.md "Testing without AWS credentials").

type Test = { name: string; fn: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: Test["fn"]) {
  tests.push({ name, fn });
}

function fakeClientReturning(text: string): BedrockConverseClient {
  return {
    send: async () => ({
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

test("pinned region and model id match the approved US inference profile — never the Global profile", () => {
  assert.equal(BEDROCK_REGION, "us-east-1");
  assert.equal(BEDROCK_MODEL_ID, "us.anthropic.claude-sonnet-4-6");
});

test("provider/model metadata is always present on a successful extraction", async () => {
  const client = fakeClientReturning(
    JSON.stringify({
      facts: [
        {
          field_path: "daily_life.bathing",
          value: true,
          assertion_state: "confirmed_yes",
          collection_method: "reported",
          reporter: "daughter",
          evidence: "she needs help bathing",
          confidence: "high",
        },
      ],
    })
  );
  const result = await extractFactsViaBedrockClaude("some transcript", client);
  assert.equal(result.provider, "bedrock-claude");
  assert.equal(result.modelId, "us.anthropic.claude-sonnet-4-6");
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].fieldPath, "daily_life.bathing");
});

test("epistemic statuses survive Claude's response exactly like OpenAI's — same normalizeExtractedFacts() applies", async () => {
  const client = fakeClientReturning(
    JSON.stringify({
      facts: [
        { field_path: "vision_hearing.hearing_difficulty", value: false, assertion_state: "confirmed_no", collection_method: "reported", reporter: "resident", evidence: "hearing is fine", confidence: "high" },
        { field_path: "cognition.short_term_memory_change", value: null, assertion_state: "uncertain", collection_method: "reported", reporter: "daughter", evidence: "not sure", confidence: "low" },
      ],
    })
  );
  const result = await extractFactsViaBedrockClaude("some transcript", client);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.accepted.find((f) => f.fieldPath === "vision_hearing.hearing_difficulty")?.assertionState, "confirmed_no");
  assert.equal(result.accepted.find((f) => f.fieldPath === "cognition.short_term_memory_change")?.assertionState, "uncertain");
});

test("UNKNOWN != FALSE still applies to Claude output: an affirmative claim with confidence 'none' is rejected, never becomes a fact", async () => {
  const client = fakeClientReturning(
    JSON.stringify({
      facts: [{ field_path: "daily_life.bathing", value: true, assertion_state: "confirmed_yes", collection_method: null, reporter: null, evidence: null, confidence: "none" }],
    })
  );
  const result = await extractFactsViaBedrockClaude("some transcript", client);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
});

test("MALFORMED RESPONSE: non-JSON text is rejected via rawResponseParseError, never crashes, never silently produces facts", async () => {
  const client = fakeClientReturning("Sure, here's the extraction: <not json at all>");
  const result = await extractFactsViaBedrockClaude("some transcript", client);
  assert.ok(result.rawResponseParseError);
  assert.equal(result.accepted.length, 0);
});

test("MALFORMED RESPONSE: valid JSON but missing the 'facts' array is treated as zero facts, not an error", async () => {
  const client = fakeClientReturning(JSON.stringify({ something_else: true }));
  const result = await extractFactsViaBedrockClaude("some transcript", client);
  assert.equal(result.rawResponseParseError, null);
  assert.equal(result.accepted.length, 0);
});

test("PROVIDER FAILURE: a thrown client error propagates as a real error, never swallowed into a fake result and never silently falls back", async () => {
  const client = fakeClientThrowing("ThrottlingException: rate exceeded");
  await assert.rejects(() => extractFactsViaBedrockClaude("some transcript", client), /Bedrock Claude invocation failed/);
});

test("empty transcript short-circuits without ever calling the client", async () => {
  let called = false;
  const client: BedrockConverseClient = {
    send: async () => {
      called = true;
      return {
        output: { message: { role: "assistant", content: [{ text: "{}" }] } },
        stopReason: "end_turn",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        metrics: { latencyMs: 0 },
        $metadata: {},
      };
    },
  };
  const result = await extractFactsViaBedrockClaude("   ", client);
  assert.equal(called, false);
  assert.deepEqual(result.accepted, []);
});

test("the exported provider object exposes correct static metadata matching the module constants", () => {
  assert.equal(bedrockClaudeExtractionProvider.providerId, "bedrock-claude");
  assert.equal(bedrockClaudeExtractionProvider.modelId, BEDROCK_MODEL_ID);
});

let passed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`ok - ${t.name}`);
  } catch (err) {
    console.log(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
