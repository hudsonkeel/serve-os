import { ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import {
  BEDROCK_REGION,
  CLAUDE_MODEL_ID,
  extractTextFromConverseResponse,
  getBedrockClient,
  type BedrockConverseClient,
} from "../../../ai/bedrockClaude.ts";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from "../../extractionPrompt.ts";
import { normalizeExtractedFacts } from "../../factTypes.ts";
import type { AssessmentExtractionProvider, ExtractionResult } from "../../extractionProvider.ts";

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
//
// Moved here 2026-09-17 (background-safe processing core split) — no `import "server-only"` and
// no React/Next dependency, so this is safely importable from a standalone Netlify Background
// Function. See ../dataAccess.ts's header comment for the full rationale.
//
// Client/region/model constants and the Converse response-text helper moved to
// lib/ai/bedrockClaude.ts 2026-09-20 (Ask Serve answer synthesis needed the exact same
// approved Bedrock client/model without duplicating this file's AWS SDK boilerplate) — this
// module keeps re-exporting them under their original names so nothing importing from here
// needs to change. Everything below this point (the extraction-specific prompt building, JSON
// parsing, and normalizeExtractedFacts() validation) is unchanged.

const REGION = BEDROCK_REGION;
const MODEL_ID = CLAUDE_MODEL_ID;
const PROVIDER_ID = "bedrock-claude";

/** The real extraction call. Accepts an injectable client so tests can exercise malformed-
 * response and error handling without any AWS credentials or network access — see
 * __tests__/bedrockClaudeProvider.test.ts. */
export async function extractFactsViaBedrockClaude(
  transcriptText: string,
  client: BedrockConverseClient = getBedrockClient()
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
    // another provider — the caller (providerSelection.ts / processingCore.ts) surfaces this as
    // a real error to the operator.
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
export type { BedrockConverseClient };
