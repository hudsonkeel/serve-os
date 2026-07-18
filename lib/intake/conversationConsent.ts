import type { ConversationContactCaptureStatus } from "@/lib/supabase/types";

// Pure consent-boundary logic for the conversation telemetry layer — Scope
// J (Production Intake Unification). See docs/integrations/
// WEBSITE_TO_SERVE_INTAKE_CONTRACT.md, "Consent and outreach boundary."
//
// Entering a phone number or email never by itself authorizes follow-up —
// only a captured name + contact method WITH an explicit consent signal
// (e.g. the care wizard's already-required TCPA checkbox) reaches
// `consented_for_followup`, the only status ever eligible for the
// recoverable-lead query. Contact info without consent still gets
// preserved (contact_capture_status stays at `partial_contact_captured`),
// but is never treated as followable.

export function deriveContactCaptureStatus(input: {
  hasContactName: boolean;
  hasContactMethod: boolean;
  consentGiven: boolean;
}): ConversationContactCaptureStatus {
  if (!input.hasContactName || !input.hasContactMethod) return "none";
  return input.consentGiven ? "consented_for_followup" : "partial_contact_captured";
}
