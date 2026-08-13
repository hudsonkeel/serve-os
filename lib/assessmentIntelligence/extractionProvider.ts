import type { NormalizationResult } from "./factTypes.ts";

// The provider-neutral extraction boundary. Any model provider that can turn a transcript into
// draft facts implements this interface and returns exactly this Serve-owned canonical shape —
// provider-specific response structures (OpenAI's chat-completion envelope, Bedrock's Converse
// API envelope, etc.) never leak past the provider's own module. See docs/architecture/
// BEDROCK_CLAUDE_PROVIDER.md.
//
// Every draft fact's provenance (which provider, which model) is carried at the extraction-run
// level here — accepted/rejected facts themselves stay provider-agnostic (NormalizedDraftFact,
// defined in factTypes.ts, already has no provider-specific fields). Persistence
// (writeDraftFacts) folds provider+modelId into the existing model_version column as
// "{provider}:{modelId}" rather than adding a new database column for this — see pipeline.ts.

export interface ExtractionResult extends NormalizationResult {
  /** Which provider produced this result — e.g. "openai", "bedrock-claude". Never inferred,
   * always set explicitly by the provider itself. */
  provider: string;
  /** The exact model/inference-profile identifier used, e.g. "gpt-5-mini" or
   * "us.anthropic.claude-sonnet-4-6". */
  modelId: string;
  rawResponseParseError: string | null;
}

export interface AssessmentExtractionProvider {
  readonly providerId: string;
  readonly modelId: string;
  /** Extracts draft facts from a transcript. Must never throw for a "no facts found" outcome
   * (that's a normal, valid `{accepted: [], ...}` result) — but MUST throw for a genuine
   * provider-level failure (network error, auth failure, invocation error) rather than return a
   * result that could be mistaken for "nothing was discussed." Callers must not catch a thrown
   * error here and silently retry against a different provider. */
  extractFacts(transcriptText: string): Promise<ExtractionResult>;
}
