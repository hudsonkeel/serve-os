import "server-only";
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from "../extractionPrompt.ts";
import { normalizeExtractedFacts } from "../factTypes.ts";
import type { AssessmentExtractionProvider, ExtractionResult } from "../extractionProvider.ts";

// Amazon Bedrock / Anthropic Claude implementation of the provider-neutral extraction interface.
// Uses the exact same provider-agnostic prompt (extractionPrompt.ts) and the exact same
// normalizeExtractedFacts() validation as the OpenAI provider — Claude's raw response gets no
// special treatment or looser rules. See docs/architecture/BEDROCK_CLAUDE_PROVIDER.md.
//
// Region and inference profile are pinned as constants, not read from an arbitrary env var —
// this integration is approved for exactly one region and one profile (US, region-pinned,
// account-level retention confirmed "none"), and nothing here should be able to silently drift
// onto a different region, the Global Claude profile, or a different model. If that ever needs
// to change, it's a deliberate code change and a new PHI-readiness review, not a runtime
// config toggle.

const REGION = "us-east-1";
const MODEL_ID = "us.anthropic.claude-sonnet-4-6";
const PROVIDER_ID = "bedrock-claude";

let cachedClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (cachedClient) return cachedClient;
  // No explicit credentials constructed here — the AWS SDK's default credential provider chain
  // resolves them (environment variables, shared config/SSO profile, or a workload identity in
  // a deployed environment), per the least-custom-code, no-static-keys-if-avoidable preference.
  cachedClient = new BedrockRuntimeClient({ region: REGION });
  return cachedClient;
}

function extractTextFromConverseResponse(response: ConverseCommandOutput): string {
  const content = response.output?.message?.content;
  if (!Array.isArray(content)) return "";
  const textBlock = content.find(
    (block): block is { text: string } => typeof block === "object" && block !== null && typeof (block as { text?: unknown }).text === "string"
  );
  return textBlock?.text ?? "";
}

/** Minimal shape this module actually needs from a Bedrock client — deliberately not the full
 * BedrockRuntimeClient type (whose overloaded `send` collapses awkwardly through `Pick`). Lets
 * tests inject a plain mock object without any AWS SDK/network dependency. */
export interface BedrockConverseClient {
  send(command: ConverseCommand): Promise<ConverseCommandOutput>;
}

/** The real extraction call. Accepts an injectable client so tests can exercise malformed-
 * response and error handling without any AWS credentials or network access — see
 * __tests__/bedrockClaudeProvider.test.ts. */
export async function extractFactsViaBedrockClaude(
  transcriptText: string,
  client: BedrockConverseClient = getClient()
): Promise<ExtractionResult> {
  if (!transcriptText || !transcriptText.trim()) {
    return { accepted: [], rejected: [], provider: PROVIDER_ID, modelId: MODEL_ID, rawResponseParseError: null };
  }

  let response: ConverseCommandOutput;
  try {
    response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: buildExtractionSystemPrompt() }],
        messages: [{ role: "user", content: [{ text: buildExtractionUserPrompt(transcriptText) }] }],
      })
    );
  } catch (err) {
    // A genuine provider-level failure (auth, network, throttling, invocation error) must never
    // be swallowed into a "no facts found" result, and must never trigger a silent fallback to
    // another provider — the caller (providerSelection.ts / pipeline.ts) surfaces this as a
    // real error to the operator.
    throw new Error(
      `Bedrock Claude invocation failed (model=${MODEL_ID}, region=${REGION}): ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  const rawContent = extractTextFromConverseResponse(response);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (err) {
    return {
      accepted: [],
      rejected: [],
      provider: PROVIDER_ID,
      modelId: MODEL_ID,
      rawResponseParseError: err instanceof Error ? err.message : "Unknown JSON parse error",
    };
  }

  const facts =
    parsedJson && typeof parsedJson === "object" && Array.isArray((parsedJson as { facts?: unknown }).facts)
      ? (parsedJson as { facts: unknown[] }).facts
      : [];

  const normalized = normalizeExtractedFacts(facts);

  return { ...normalized, provider: PROVIDER_ID, modelId: MODEL_ID, rawResponseParseError: null };
}

export const bedrockClaudeExtractionProvider: AssessmentExtractionProvider = {
  providerId: PROVIDER_ID,
  modelId: MODEL_ID,
  extractFacts: (transcriptText: string) => extractFactsViaBedrockClaude(transcriptText),
};

export { REGION as BEDROCK_REGION, MODEL_ID as BEDROCK_MODEL_ID };
