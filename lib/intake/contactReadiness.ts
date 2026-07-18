import type { IntakeEnvelope, IntakeReasonCode } from "./types.ts";

// Contact-Ready determination — see docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md,
// "Contact-Ready Principle." Pure, deterministic: separates "do we know who to contact and
// how" from classification precision. A submission with a name and a phone or email is
// always operationally actionable, regardless of what else is missing.

export type OperationalReadiness = "contact_ready" | "needs_resolution" | "not_actionable";

export interface ContactReadiness {
  status: OperationalReadiness;
  reasonCodes: IntakeReasonCode[];
}

// The one identity signal every intake type shares — the person who filled out the form,
// not the (possibly different, possibly unknown) prospective client.
function contactName(envelope: IntakeEnvelope): string | null {
  return envelope.primaryContact.fullName;
}

export function computeContactReadiness(envelope: IntakeEnvelope): ContactReadiness {
  const name = contactName(envelope);
  const hasName = !!(name && name.trim());
  const hasPhone = !!envelope.primaryContact.phone;
  const hasEmail = !!envelope.primaryContact.email;
  const hasContactMethod = hasPhone || hasEmail;

  const reasonCodes: IntakeReasonCode[] = [];
  if (hasName) reasonCodes.push("CONTACT_NAME_PRESENT");
  if (hasPhone) reasonCodes.push("PHONE_PRESENT");
  if (hasEmail) reasonCodes.push("EMAIL_PRESENT");

  if (hasName && hasContactMethod) {
    return { status: "contact_ready", reasonCodes: [...reasonCodes, "CONTACT_READY"] };
  }

  if (!hasName && !hasContactMethod) {
    return { status: "not_actionable", reasonCodes: ["NO_CONTACT_INFORMATION"] };
  }

  if (!hasName) {
    return { status: "needs_resolution", reasonCodes: [...reasonCodes, "MISSING_CONTACT_NAME"] };
  }

  return { status: "needs_resolution", reasonCodes: [...reasonCodes, "MISSING_CONTACT_METHOD"] };
}

// Deterministic reason-code -> plain-language mapping for the "Learn during follow-up"
// summary (Part 8). Derived at read time from the one persisted source of truth
// (intake_processing_records.reason_codes) rather than a second mutable field — reused by
// both the Next Action agenda (server-side) and the Intake Queue UI (client-side). Most
// reason codes are "present" signals; only a handful indicate a specific missing field, and
// timing's absence is inferred from the absence of its own presence code.
export function reasonCodesToMissingFieldLabels(reasonCodes: readonly string[]): string[] {
  const labels: string[] = [];
  const set = new Set(reasonCodes);

  if (set.has("INCOMPLETE_PROSPECTIVE_CLIENT")) labels.push("Who needs care");
  if (set.has("RESIDENT_LINK_UNRESOLVED")) labels.push("Which resident this is (confirm identity)");
  if (set.has("INCOMPLETE_SERVICE_LOCATION") || set.has("SERVICE_LOCATION_INCOMPLETE")) {
    labels.push("Where care would be provided");
  }
  if (set.has("INCOMPLETE_CARE_CONTEXT")) labels.push("What support is needed");
  if (!set.has("TIMING_PRESENT")) labels.push("When help may be needed");

  return labels;
}

// Deterministic follow-up agenda for the first Next Action's detail (Part 7/8) — never the
// generic "Review Website Inquiry," always a specific conversation starter plus a short,
// non-alarming list of what to confirm during the call.
export function buildFollowUpAgenda(contactName: string, missingFieldLabels: readonly string[]): string {
  const intro = `Contact ${contactName}.`;
  if (missingFieldLabels.length === 0) return intro;
  const bullets = missingFieldLabels.map((label) => `- ${label}`).join("\n");
  return `${intro}\n\nLearn during follow-up:\n${bullets}`;
}
