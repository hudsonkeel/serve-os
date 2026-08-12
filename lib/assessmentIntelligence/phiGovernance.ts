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
