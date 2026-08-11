// The one enforcement point for "no real PHI reaches OpenAI until the BAA is executed and
// Modified Retention is provisioned." Every code path that would send real captured audio (or
// any other real resident data) to OpenAI must call requirePhiOpenAiProcessingConfirmed() first
// and let it throw — never proceed past it "just this once," never infer confirmation from the
// presence of OPENAI_API_KEY alone (that flag only proves a credential exists, not that it's
// cleared for PHI). This flag defaults to unset/false and must be explicitly set to the exact
// string "true" by a human who has confirmed both conditions — it is never set by application
// code. See docs/architecture/AUDIO_TRANSCRIPTION_PIPELINE.md.

export function isPhiOpenAiProcessingConfirmed(): boolean {
  return process.env.PHI_OPENAI_PROCESSING_CONFIRMED === "true";
}

export function requirePhiOpenAiProcessingConfirmed(): void {
  if (!isPhiOpenAiProcessingConfirmed()) {
    throw new Error(
      "PHI_OPENAI_PROCESSING_CONFIRMED is not set to 'true'. Real resident audio/data may not be " +
        "sent to OpenAI until the BAA is executed and Modified Retention is provisioned and a human " +
        "has explicitly confirmed both by setting this flag. Not bypassed, not inferred from " +
        "OPENAI_API_KEY's presence alone."
    );
  }
}
