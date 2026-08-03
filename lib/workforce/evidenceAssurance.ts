// Human Attestation & Evidence Assurance (Phase 1D) — a single, centrally
// preserved, deterministic vocabulary for "how confidently can Serve OS
// independently support what it believes." Never hardcoded per requirement
// — every requirement's assurance level is derived the same way, from the
// same already-computed RequirementEvaluation the shared engine
// (lib/compliance/requirementSetStatus.ts) produces. The evaluator itself
// is never touched; this is presentation/interpretation layered on top,
// exactly like lib/workforce/operationalUnderstanding.ts, which now
// composes this module's output rather than inventing its own.
import type { RequirementEvaluation } from "../compliance/requirementSetStatus.ts";

export type EvidenceAssuranceLevel = "Unknown" | "Inferred" | "Corroborated" | "Attested" | "Verified" | "Contradictory";

// Ordered weakest -> strongest for the four "positive" levels; Contradictory
// is a distinct problem signal, not a point on this same ladder (evidence
// exists and actively conflicts, which is a different kind of concern than
// "not yet strong enough"). Exposed for any future UI that wants a simple
// strength comparison — deriveEvidenceAssuranceLevel() below never needs it
// itself.
export const EVIDENCE_ASSURANCE_LADDER: readonly EvidenceAssuranceLevel[] = [
  "Unknown",
  "Inferred",
  "Corroborated",
  "Attested",
  "Verified",
];

// Reachable today: Unknown (nothing connected), Corroborated (evidence
// present, not yet judged by any human or system), Attested (a Human
// Attestation recorded a qualified/observed-with-caveat result), Verified
// (a clean, judged-satisfying result — whether from the original document-
// verify flow or a clean Human Attestation), Contradictory (evidence exists
// and was rejected, or an attestation observed a non-satisfying result).
//
// NOT reachable yet: Inferred — reserved for a future signal derived
// indirectly (e.g. an AxisCare class/attribute hinting at a credential
// without direct evidence recorded for this specific requirement). No
// inference mechanism exists in this codebase today; the vocabulary slot
// exists so a future Digital Compatriot or signal-inference feature has
// somewhere to land without a redesign, not because anything produces it
// now. Disclosed explicitly rather than silently unreachable.
export function deriveEvidenceAssuranceLevel(evaluation: RequirementEvaluation): EvidenceAssuranceLevel {
  switch (evaluation.status) {
    case "missing":
      return "Unknown";
    case "awaiting_verification":
      return "Corroborated";
    case "requires_review":
      return "Contradictory";
    case "expired":
    case "expiring_soon":
    case "satisfied":
      // A qualified Human Attestation ("Verified with Observation") stays
      // one notch below a clean result — still a real, judged confirmation,
      // just not an unconditional one. Every other path (the original
      // document-verify flow, or a clean attestation) reaches Verified.
      // Expired/expiring_soon evidence keeps the assurance level it earned
      // when it was recorded — currency is Audit Readiness's concern, kept
      // independently visible, not assurance's.
      return evaluation.latestEvidence?.attestation_result === "verified_with_observation" ? "Attested" : "Verified";
  }
}

export const EVIDENCE_ASSURANCE_STYLES: Record<EvidenceAssuranceLevel, string> = {
  Unknown: "bg-ivory-warm text-muted",
  Inferred: "bg-blue-50 text-blue-700",
  Corroborated: "bg-blue-50 text-blue-700",
  Attested: "bg-amber-50 text-amber-700",
  Verified: "bg-emerald-50 text-emerald-700",
  Contradictory: "bg-red-50 text-red-700",
};
