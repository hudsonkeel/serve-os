import "server-only";
import type { AssessmentExtractionProvider } from "./extractionProvider.ts";
import { openAiExtractionProvider } from "./extraction.ts";
import { bedrockClaudeExtractionProvider } from "./providers/bedrockClaudeProvider.ts";

// The single place that decides which extraction provider handles a real call. Configuration-
// driven (ASSESSMENT_EXTRACTION_PROVIDER), never inferred, never silently switched at runtime.
// Unset -> the known-working default (openai). Set to an unrecognized value -> throws, rather
// than guessing which provider was meant. A provider that fails during actual extraction is
// never caught here and rerouted to a different provider — see extractionProvider.ts's
// AssessmentExtractionProvider contract and pipeline.ts, which lets a thrown error propagate.

const PROVIDERS: Record<string, AssessmentExtractionProvider> = {
  openai: openAiExtractionProvider,
  bedrock: bedrockClaudeExtractionProvider,
};

export const DEFAULT_EXTRACTION_PROVIDER_ID = "openai";

export function getConfiguredExtractionProvider(): AssessmentExtractionProvider {
  const requested = process.env.ASSESSMENT_EXTRACTION_PROVIDER?.trim() || DEFAULT_EXTRACTION_PROVIDER_ID;
  const provider = PROVIDERS[requested];
  if (!provider) {
    throw new Error(
      `Unknown ASSESSMENT_EXTRACTION_PROVIDER "${requested}" — expected one of: ${Object.keys(PROVIDERS).join(", ")}. Refusing to guess and silently fall back to a default.`
    );
  }
  return provider;
}
