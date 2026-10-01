// The one enforcement point for "no real PHI reaches OpenAI until the BAA is executed and
// Modified Retention is provisioned." Every code path that would send real captured audio (or
// any other real resident data) to OpenAI must call requirePhiOpenAiProcessingConfirmed() first
// and let it throw — never proceed past it "just this once," never infer confirmation from the
// presence of OPENAI_API_KEY alone (that flag only proves a credential exists, not that it's
// cleared for PHI). PHI_OPENAI_PROCESSING_CONFIRMED defaults to unset/false and must be
// explicitly set to the exact string "true" by a human who has confirmed both conditions — it is
// never set by application code. See docs/architecture/AUDIO_TRANSCRIPTION_PIPELINE.md.

function isProductionGateConfirmed(): boolean {
  return process.env.PHI_OPENAI_PROCESSING_CONFIRMED === "true";
}

// A narrow, separate escape hatch for validating the transcription pipeline against
// fabricated, non-PHI audio while the production gate above stays closed. Deliberately NOT the
// same flag or value as PHI_OPENAI_PROCESSING_CONFIRMED, in either direction: confirming the BAA
// does not enable this, and this being set does not satisfy the production gate. It must be
// requested explicitly by a caller (`syntheticTestOverride: true`) — no code path reachable from
// the production webhook (app/api/intake/transcribe/route.ts) or any human-facing action ever
// passes that flag; only a dedicated, manually-run validation script does. See docs/architecture/
// AUDIO_TRANSCRIPTION_PIPELINE.md "Synthetic pre-merge validation."
const SYNTHETIC_TEST_MODE_VALUE = "synthetic-only-not-for-production";

function isSyntheticTestModeActive(): boolean {
  return process.env.PHI_SYNTHETIC_TEST_MODE === SYNTHETIC_TEST_MODE_VALUE;
}

export interface PhiGateOverride {
  syntheticTestOverride?: boolean;
}

export function isPhiOpenAiProcessingConfirmed(override?: PhiGateOverride): boolean {
  if (override?.syntheticTestOverride) {
    return isSyntheticTestModeActive();
  }
  return isProductionGateConfirmed();
}

export function requirePhiOpenAiProcessingConfirmed(override?: PhiGateOverride): void {
  if (override?.syntheticTestOverride) {
    if (!isSyntheticTestModeActive()) {
      throw new Error(
        "syntheticTestOverride was requested but PHI_SYNTHETIC_TEST_MODE is not set to the exact " +
          "expected value. This override never falls back to checking PHI_OPENAI_PROCESSING_CONFIRMED " +
          "— the two flags are intentionally independent."
      );
    }
    return;
  }
  if (!isProductionGateConfirmed()) {
    throw new Error(
      "PHI_OPENAI_PROCESSING_CONFIRMED is not set to 'true'. Real resident audio/data may not be " +
        "sent to OpenAI until the BAA is executed and Modified Retention is provisioned and a human " +
        "has explicitly confirmed both by setting this flag. Not bypassed, not inferred from " +
        "OPENAI_API_KEY's presence alone. (A separate, narrower syntheticTestOverride exists for " +
        "validating this pipeline against fabricated non-PHI audio — it was not requested here.)"
    );
  }
}

// ─── AWS PHI gate (Assessment audio → AWS Transcribe → Bedrock) ───────────────────────────────
// AWS is Serve's intended PHI-processing boundary for captured assessment audio. Before any real
// assessment audio or transcript reaches AWS Transcribe/S3/Bedrock, a human must have attested
// that the AWS posture is approved — BAA applicability for the account in use, HIPAA-eligible
// services (Transcribe, S3, Bedrock), least-privilege IAM, encryption at rest, the pinned
// us-east-1 region, logging reviewed for PHI capture, and a lifecycle/retention rule on the
// temporary staging prefix — by setting PHI_AWS_PROCESSING_CONFIRMED to exactly "true". It is a
// human attestation, never set or inferred by code (and never inferred from AWS credentials
// existing). Independent of the OpenAI gate above in both directions.
//
// Synthetic (fictional, non-PHI) validation is SESSION-scoped: it requires BOTH the session's own
// is_synthetic_test flag (set only through the admin-only, attested marking action — never
// inferred from a resident's name) AND this deployment's PHI_SYNTHETIC_TEST_MODE. Marking one
// session synthetic can never authorize any other session, and the deployment flag alone
// authorizes nothing.

const AWS_PHI_CONFIRMED_VALUE = "true";

export type AwsAssessmentAuthorization =
  | { allowed: true; basis: "phi_attested" | "synthetic_test" }
  | { allowed: false; reason: string };

export function isAwsPhiProcessingConfirmed(env: Record<string, string | undefined> = process.env): boolean {
  return env.PHI_AWS_PROCESSING_CONFIRMED === AWS_PHI_CONFIRMED_VALUE;
}

export function isSyntheticTestModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PHI_SYNTHETIC_TEST_MODE === SYNTHETIC_TEST_MODE_VALUE;
}

export function decideAwsAssessmentAuthorization(
  session: { isSyntheticTest: boolean },
  env: Record<string, string | undefined> = process.env
): AwsAssessmentAuthorization {
  if (isAwsPhiProcessingConfirmed(env)) return { allowed: true, basis: "phi_attested" };
  if (session.isSyntheticTest === true && isSyntheticTestModeEnabled(env)) return { allowed: true, basis: "synthetic_test" };
  return {
    allowed: false,
    reason:
      "AWS processing of assessment audio is not authorized for this session: PHI_AWS_PROCESSING_CONFIRMED is not 'true', " +
      "and the session is not an attested synthetic test on a deployment with PHI_SYNTHETIC_TEST_MODE enabled.",
  };
}

/** Which captured sessions a dispatcher may even consider for AWS transcription. "none" means no
 * captured session is dispatched at all, so a gate-blocked backlog can never be selected. */
export function awsTranscriptionDispatchScope(env: Record<string, string | undefined> = process.env): "all_captured" | "synthetic_only" | "none" {
  if (isAwsPhiProcessingConfirmed(env)) return "all_captured";
  if (isSyntheticTestModeEnabled(env)) return "synthetic_only";
  return "none";
}
