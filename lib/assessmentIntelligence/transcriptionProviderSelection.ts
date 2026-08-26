import "server-only";
import type { AssessmentTranscriptionProvider } from "./transcriptionProvider.ts";
import { openAiTranscriptionProvider } from "./providers/openAiTranscriptionProvider.ts";
import { awsTranscribeProvider } from "./providers/awsTranscribeProvider.ts";

// Mirrors providerSelection.ts (extraction) exactly, for transcription. Configuration-driven
// (ASSESSMENT_TRANSCRIPTION_PROVIDER), never inferred, never silently switched at runtime.
// Unset -> the known-working default (openai) — NOT a statement that OpenAI is the intended
// production PHI path (it explicitly is not, per the 2026-08-15 architecture decision; see
// phiGovernance.ts's PHI_AWS_PROCESSING_CONFIRMED comment). The default stays "openai" because
// that's the provider every existing synthetic/dev workflow already depends on; production use
// requires BOTH selecting "aws" here AND satisfying PHI_AWS_PROCESSING_CONFIRMED — two
// independent, deliberate steps, not one flag doing double duty.
//
// A provider that fails is never caught here and rerouted to a different provider — same
// discipline as extraction's providerSelection.ts. Real PHI must never be silently rerouted to
// OpenAI as a convenience fallback if AWS fails; a thrown error propagates to the caller.

const PROVIDERS: Record<string, AssessmentTranscriptionProvider> = {
  openai: openAiTranscriptionProvider,
  aws: awsTranscribeProvider,
};

export const DEFAULT_TRANSCRIPTION_PROVIDER_ID = "openai";

/** The configuration key itself ("openai" | "aws") — distinct from the provider's own
 * self-reported `providerId` (e.g. "aws-transcribe"). Exposed separately so callers (pipeline.ts)
 * can decide which PHI gate applies without needing to construct the provider first. */
export function getConfiguredTranscriptionProviderKey(): string {
  return process.env.ASSESSMENT_TRANSCRIPTION_PROVIDER?.trim() || DEFAULT_TRANSCRIPTION_PROVIDER_ID;
}

export function getConfiguredTranscriptionProvider(): AssessmentTranscriptionProvider {
  const requested = getConfiguredTranscriptionProviderKey();
  const provider = PROVIDERS[requested];
  if (!provider) {
    throw new Error(
      `Unknown ASSESSMENT_TRANSCRIPTION_PROVIDER "${requested}" — expected one of: ${Object.keys(PROVIDERS).join(", ")}. Refusing to guess and silently fall back to a default.`
    );
  }
  return provider;
}

/** Looks a provider up by its own self-reported `providerId` (e.g. "aws-transcribe") — NOT the
 * configuration key. Used by the background worker to resume checking an already-started job
 * with the exact provider that started it, regardless of what ASSESSMENT_TRANSCRIPTION_PROVIDER
 * happens to be set to right now. A job in flight must never be handed to a different provider
 * than the one that started it, even if the env var changes between worker ticks. */
export function getTranscriptionProviderByProviderId(providerId: string): AssessmentTranscriptionProvider {
  const provider = Object.values(PROVIDERS).find((p) => p.providerId === providerId);
  if (!provider) {
    throw new Error(`No known transcription provider with providerId "${providerId}" — cannot resume this job.`);
  }
  return provider;
}
