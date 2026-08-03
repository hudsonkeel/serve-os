// Attention-Driven Operations (Phase 1C), refined under Human Attestation &
// Evidence Assurance (Phase 1D) — the three-axis distinction the product
// requires at Level 3: what we operationally believe happened, is distinct
// from how well that belief is corroborated by evidence, is distinct from
// whether that could be defended to an auditor today. All three stay
// independently visible — an expired-but-previously-verified fact keeps
// its earned assurance level; only its audit readiness reflects that it's
// gone stale.
//
// The platform must never represent "no evidence connected yet" as
// "the event never happened" — the 'missing' branch below says exactly
// that: Unknown, not "not completed." Not knowing something occurred is a
// different claim than knowing it didn't.
import type { RequirementEvaluation } from "../compliance/requirementSetStatus.ts";
import { deriveEvidenceAssuranceLevel, type EvidenceAssuranceLevel } from "./evidenceAssurance.ts";

export interface OperationalUnderstanding {
  operationalUnderstanding: string;
  evidenceAssurance: EvidenceAssuranceLevel;
  auditReadiness: string;
}

export function deriveOperationalUnderstanding(evaluation: RequirementEvaluation): OperationalUnderstanding {
  const { status, latestEvidence } = evaluation;
  const evidenceAssurance = deriveEvidenceAssuranceLevel(evaluation);

  switch (status) {
    case "satisfied":
      return {
        operationalUnderstanding: "Completed",
        evidenceAssurance,
        auditReadiness: "Ready",
      };
    case "expiring_soon":
      return {
        operationalUnderstanding: "Completed",
        evidenceAssurance,
        auditReadiness: "Ready — renewal approaching",
      };
    case "missing":
      return {
        operationalUnderstanding: "Unknown — no evidence has been connected yet",
        evidenceAssurance,
        auditReadiness: "Action required — connect evidence from an authoritative source",
      };
    case "awaiting_verification":
      return {
        operationalUnderstanding: "Completed",
        evidenceAssurance,
        auditReadiness: "Needs Source Confirmation",
      };
    case "expired":
      return {
        operationalUnderstanding: "Was completed, now lapsed",
        evidenceAssurance,
        auditReadiness: "Action required — renewal needed",
      };
    case "requires_review": {
      const belowScore = latestEvidence?.verification_status === "verified";
      return {
        operationalUnderstanding: belowScore
          ? "Reported complete, but did not meet the required standard"
          : "Reported complete, but the evidence was found insufficient",
        evidenceAssurance,
        auditReadiness: "Needs Human Review",
      };
    }
  }
}
