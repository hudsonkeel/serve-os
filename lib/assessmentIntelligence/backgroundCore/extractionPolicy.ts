// Which extraction provider may process an assessment, decided before any provider call (pure).
//
// ONE policy for every assessment, whatever the transcript's origin (recorded audio or a pasted
// transcript — both are real client conversation, so both are PHI):
// - an empty transcript is never extracted (it would only produce an empty draft);
// - ASSESSMENT_EXTRACTION_PROVIDER must be EXPLICITLY "bedrock" — no implicit default, never
//   OpenAI (no PHI-cleared OpenAI path exists for assessment extraction);
// - the session must pass the AWS PHI gate (attested PHI processing, or an attested synthetic
//   session in synthetic test mode).
// Otherwise extraction fails closed. (Merge-readiness B1: pasted transcripts previously used the
// configured provider with no PHI gate at all, defaulting to OpenAI when unset.)

import type { AwsAssessmentAuthorization } from "../phiGovernance.ts";

export const ASSESSMENT_EXTRACTION_PROVIDER_REQUIRED = "bedrock";

export type ExtractionPolicyDecision = { ok: true; providerKey: string } | { ok: false; reason: string };

export function decideExtractionPolicy(input: {
  transcriptText: string;
  configuredProvider: string | undefined;
  awsAuthorization: AwsAssessmentAuthorization;
}): ExtractionPolicyDecision {
  if (!input.transcriptText || !input.transcriptText.trim()) {
    return { ok: false, reason: "No transcript text is available for this assessment, so nothing was extracted." };
  }
  const configured = input.configuredProvider?.trim() || "";
  if (configured !== ASSESSMENT_EXTRACTION_PROVIDER_REQUIRED) {
    return {
      ok: false,
      reason: `Assessment extraction requires ASSESSMENT_EXTRACTION_PROVIDER=${ASSESSMENT_EXTRACTION_PROVIDER_REQUIRED} (currently ${configured ? `"${configured}"` : "unset"}); it never falls back to another provider.`,
    };
  }
  if (!input.awsAuthorization.allowed) return { ok: false, reason: input.awsAuthorization.reason };
  return { ok: true, providerKey: ASSESSMENT_EXTRACTION_PROVIDER_REQUIRED };
}
