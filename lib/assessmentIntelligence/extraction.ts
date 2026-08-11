import "server-only";
import OpenAI from "openai";
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from "./extractionPrompt.ts";
import { normalizeExtractedFacts, type NormalizationResult } from "./factTypes.ts";

// The extraction pipeline's only entry point. Takes plain transcript text — it does not know
// or care whether that text came from a pasted-transcript dev/validation entry (today) or a
// future transcription pipeline's intake_transcript_segments joined into one string (later);
// see docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §3A. This function is never
// called directly from a UI component — only from the server action / data layer that already
// resolved the transcript text from intake_sources, keeping extraction logic decoupled from
// how the text arrived.

export interface ExtractionResult extends NormalizationResult {
  modelVersion: string;
  rawResponseParseError: string | null;
}

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

export async function extractFactsFromTranscript(transcriptText: string): Promise<ExtractionResult> {
  if (!transcriptText || !transcriptText.trim()) {
    return { accepted: [], rejected: [], modelVersion: MODEL, rawResponseParseError: null };
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
      modelVersion: MODEL,
      rawResponseParseError: err instanceof Error ? err.message : "Unknown JSON parse error",
    };
  }

  const facts =
    parsedJson && typeof parsedJson === "object" && Array.isArray((parsedJson as { facts?: unknown }).facts)
      ? (parsedJson as { facts: unknown[] }).facts
      : [];

  const normalized = normalizeExtractedFacts(facts);

  return { ...normalized, modelVersion: MODEL, rawResponseParseError: null };
}
