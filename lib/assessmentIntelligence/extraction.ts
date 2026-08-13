import "server-only";
import OpenAI from "openai";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from "./extractionPrompt.ts";
import { normalizeExtractedFacts } from "./factTypes.ts";
import type { AssessmentExtractionProvider, ExtractionResult } from "./extractionProvider.ts";

// The OpenAI implementation of the provider-neutral extraction interface (extractionProvider.ts).
// Takes plain transcript text — it does not know or care whether that text came from a
// pasted-transcript dev/validation entry or the transcription pipeline's assembled segments;
// see docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §3A. Never called directly
// from a UI component — only through providerSelection.ts, which pipeline.ts uses.

export type { ExtractionResult };

let cachedClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY — required for assessment extraction. Not fabricated; add it to configure this capability."
    );
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

const MODEL = "gpt-5-mini";
const PROVIDER_ID = "openai";

export async function extractFactsFromTranscript(transcriptText: string): Promise<ExtractionResult> {
  if (!transcriptText || !transcriptText.trim()) {
    return { accepted: [], rejected: [], provider: PROVIDER_ID, modelId: MODEL, rawResponseParseError: null };
  }

  const openai = getOpenAiClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: buildExtractionSystemPrompt() },
      { role: "user", content: buildExtractionUserPrompt(transcriptText) },
    ],
  });

  const rawContent = response.choices[0]?.message?.content ?? "";

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (err) {
    return {
      accepted: [],
      rejected: [],
      provider: PROVIDER_ID,
      modelId: MODEL,
      rawResponseParseError: err instanceof Error ? err.message : "Unknown JSON parse error",
    };
  }

  const facts =
    parsedJson && typeof parsedJson === "object" && Array.isArray((parsedJson as { facts?: unknown }).facts)
      ? (parsedJson as { facts: unknown[] }).facts
      : [];

  const normalized = normalizeExtractedFacts(facts);

  return { ...normalized, provider: PROVIDER_ID, modelId: MODEL, rawResponseParseError: null };
}

export const openAiExtractionProvider: AssessmentExtractionProvider = {
  providerId: PROVIDER_ID,
  modelId: MODEL,
  extractFacts: extractFactsFromTranscript,
};
