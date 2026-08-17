// Emergency Preparedness's Domain Interpretation of the shared,
// domain-agnostic engine — mirrors
// lib/workforce/employeeRecordAuditReadiness.ts's own pattern exactly: this
// file knows about Emergency Preparedness's own requirement codes and
// P&P §256 vocabulary; it never recomputes status from raw evidence itself
// — that stays lib/compliance/requirementSetStatus.ts's job, reused
// completely unchanged.
import { evaluateRequirementSetStatus } from "../compliance/requirementSetStatus.ts";
import { deriveAuditReadinessStatus, type AuditReadinessStatus, type EvidenceSatisfactionClassification } from "../compliance/auditReadinessStatus.ts";
import { getRequirementSetWithRequirements } from "../data/personRequirements.ts";
import { getPersonEvidenceForSubject } from "../data/personEvidence.ts";
import { getComplianceActivityForSubject } from "../data/complianceActivity.ts";
import { getAgencyBySlug } from "../data/agencies.ts";
import {
  AGENCY_SERVICE_AREA_EXPANSION_EVENT,
  AGENCY_TEMPORARY_RELOCATION_EVENT,
  EMERGENCY_PREPAREDNESS_READINESS_SET_CODE,
  EP_HHS_NOTIFICATION,
  SERVE_CAREGIVING_AGENCY_SLUG,
} from "./constants.ts";
import type { Agency, PersonEvidence, PersonRequirement } from "../supabase/types.ts";

function formatDate(dateString: string | null): string {
  if (!dateString) return "an unspecified date";
  return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// The only satisfaction_context values that change the *explanation* label
// (auditReadinessStatus.ts's existing satisfied_by_event mechanism) — never
// a different compliance outcome. annual_reaffirmation/annual_update/
// annual_review_completed all read as the ordinary "compliant" label (no
// override), matching "both are satisfied, only the label and supersession
// relationship differ."
export function classifyEmergencyPreparednessEvidence(evidence: PersonEvidence): EvidenceSatisfactionClassification | null {
  if (evidence.satisfaction_context === "planned_drill") {
    return {
      status: "satisfied_by_event",
      explanation: `Satisfied by planned drill — ${formatDate(evidence.effective_date)}.`,
    };
  }
  if (evidence.satisfaction_context === "actual_emergency_response") {
    return {
      status: "satisfied_by_event",
      explanation: `Satisfied by qualifying actual emergency response — ${formatDate(evidence.effective_date)}.`,
    };
  }
  return null;
}

export interface EmergencyPreparednessRequirementEvaluation {
  status: AuditReadinessStatus;
  explanation: string;
  requirement: PersonRequirement;
  latestEvidence: PersonEvidence | null;
}

export interface EmergencyPreparednessReadinessEvaluation {
  agency: Agency;
  requirements: EmergencyPreparednessRequirementEvaluation[];
  // Mirrors DomainReadinessRollup.readySubjectCount's contract at
  // agency-scale (0 or 1) — true only when every *applicable* requirement
  // (not_applicable ones excluded, same discipline as
  // domainRequirementTotals() on the dashboard) currently satisfies.
  ready: boolean;
}

// EP_HHS_NOTIFICATION is not_applicable by default and becomes evaluable
// only once a real triggering event is recorded — never inferred from
// evidence absence. The shared engine has no per-requirement "not
// applicable" concept (only a whole-set one, for zero requirements), so
// this domain module builds the *effective* requirement list itself:
// HHS_NOTIFICATION is excluded from the evaluator call entirely when no
// qualifying event exists, and reported directly as not_applicable — the
// same "domain composes, engine doesn't know about this" discipline
// EvidenceSatisfactionClassifier already establishes for satisfied_by_event.
export async function getEmergencyPreparednessReadinessEvaluation(): Promise<EmergencyPreparednessReadinessEvaluation | null> {
  const agency = await getAgencyBySlug(SERVE_CAREGIVING_AGENCY_SLUG);
  if (!agency) return null;

  const [set, evidence, operationalEvents] = await Promise.all([
    getRequirementSetWithRequirements(EMERGENCY_PREPAREDNESS_READINESS_SET_CODE),
    getPersonEvidenceForSubject("agency", agency.id),
    getComplianceActivityForSubject("agency", agency.id),
  ]);

  const allRequirements = set?.requirements ?? [];
  const hhsRequirement = allRequirements.find((r) => r.requirement_code === EP_HHS_NOTIFICATION) ?? null;
  const hasQualifyingEvent = operationalEvents.some(
    (e) => e.event_type === AGENCY_TEMPORARY_RELOCATION_EVENT || e.event_type === AGENCY_SERVICE_AREA_EXPANSION_EVENT
  );

  const evaluableRequirements = allRequirements.filter(
    (r) => r.requirement_code !== EP_HHS_NOTIFICATION || hasQualifyingEvent
  );

  const setEvaluation = evaluateRequirementSetStatus(evaluableRequirements, evidence);
  const derived = deriveAuditReadinessStatus(setEvaluation, classifyEmergencyPreparednessEvidence);

  const requirements: EmergencyPreparednessRequirementEvaluation[] = derived.requirements.map((r) => ({
    status: r.status,
    explanation: r.explanation,
    requirement: r.requirementEvaluation.requirement,
    latestEvidence: r.requirementEvaluation.latestEvidence,
  }));

  if (hhsRequirement && !hasQualifyingEvent) {
    requirements.push({
      status: "not_applicable",
      explanation: "Not applicable — no temporary relocation or service-area expansion has been recorded.",
      requirement: hhsRequirement,
      latestEvidence: null,
    });
  }

  const applicable = requirements.filter((r) => r.status !== "not_applicable");
  const ready =
    applicable.length > 0 &&
    applicable.every((r) => r.status === "compliant" || r.status === "satisfied_by_event" || r.status === "exception");

  return { agency, requirements, ready };
}
