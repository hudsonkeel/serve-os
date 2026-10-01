// Which extraction provider may process a queued assessment, decided before any provider call
// (pure).
//
// - Every source: an empty transcript is never extracted (it would only produce an empty draft).
// - Audio-derived assessments (any live_audio_stream source — the captured/transcribed path):
//   AWS-only. ASSESSMENT_EXTRACTION_PROVIDER must be EXPLICITLY "bedrock" (no implicit default,
//   never OpenAI), and the session must pass the AWS PHI gate (attested PHI processing, or an
//   attested synthetic session in synthetic test mode). Otherwise extraction fails closed.
// - Pasted transcripts (admin/test fallback): unchanged existing behavior — the configured
//   provider, defaulting as before. Setting ASSESSMENT_EXTRACTION_PROVIDER=bedrock explicitly in
//   every deployed context is still required to keep pasted transcripts off OpenAI.

import { DEFAULT_EXTRACTION_PROVIDER_ID } from "./providerSelection.ts";
import type { AwsAssessmentAuthorization } from "../phiGovernance.ts";

export const AUDIO_ASSESSMENT_EXTRACTION_PROVIDER = "bedrock";

export type ExtractionPolicyDecision = { ok: true; providerKey: string } | { ok: false; reason: string };

export function decideExtractionPolicy(input: {
  transcriptText: string;
  audioDerived: boolean;
  configuredProvider: string | undefined;
  awsAuthorization: AwsAssessmentAuthorization;
}): ExtractionPolicyDecision {
  if (!input.transcriptText || !input.transcriptText.trim()) {
    return { ok: false, reason: "No transcript text is available for this assessment, so nothing was extracted." };
  }
  const configured = input.configuredProvider?.trim() || "";
  if (input.audioDerived) {
    if (configured !== AUDIO_ASSESSMENT_EXTRACTION_PROVIDER) {
      return {
        ok: false,
        reason: `Assessment extraction for recorded audio requires ASSESSMENT_EXTRACTION_PROVIDER=${AUDIO_ASSESSMENT_EXTRACTION_PROVIDER} (currently ${configured ? `"${configured}"` : "unset"}); it never falls back to another provider.`,
      };
    }
    if (!input.awsAuthorization.allowed) return { ok: false, reason: input.awsAuthorization.reason };
    return { ok: true, providerKey: AUDIO_ASSESSMENT_EXTRACTION_PROVIDER };
  }
  return { ok: true, providerKey: configured || DEFAULT_EXTRACTION_PROVIDER_ID };
}
