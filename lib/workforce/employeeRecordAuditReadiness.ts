// Workforce's Domain Interpretation of the Employee Record Audit
// requirement set — the operational product this file supports directly
// answers "is every employee currently eligible to work, and why." Mirrors
// lib/workforce/registryReadiness.ts's existing pattern exactly: this file
// knows about Employee Record Audit; it never recomputes status from raw
// evidence itself — that stays lib/compliance/requirementSetStatus.ts's
// job, reused unchanged.
import { evaluateRequirementSetStatus, type RequirementSetEvaluation } from "../compliance/requirementSetStatus.ts";
import { getRequirementSetWithRequirements } from "../data/personRequirements.ts";
import { getPersonEvidenceForSubject } from "../data/personEvidence.ts";
import { SUBJECT_TYPE_WORKFORCE_MEMBER } from "../supabase/types.ts";
import type { WorkforceLifecycleStatus } from "./lifecycleStatus.ts";
import { isEligibleForComplianceFilters } from "./registrySummary.ts";

export const WORKFORCE_EMPLOYEE_RECORD_AUDIT_SET_CODE = "WORKFORCE_EMPLOYEE_RECORD_AUDIT";

// The plain-language readiness vocabulary the product surfaces — never
// "complete/incomplete/awaiting_verification," always "ready to work" or
// exactly why not. Reused identically by the dashboard, the roster, and
// the employee detail page, so the three surfaces can never disagree.
export type EmployeeRecordAuditReadiness = "ready" | "expiring_soon" | "awaiting_verification" | "blocked" | "not_applicable";

export interface EmployeeRecordAuditEvaluation {
  readiness: EmployeeRecordAuditReadiness;
  explanation: string;
  registry: RequirementSetEvaluation;
}

// Pure — the same terminated-caregiver override already established for
// the Registry Evidence set (lib/workforce/registrySummary.ts's own
// resolveRequirementDisplay), applied one level up, at the whole-set
// readiness a person actually sees first.
export function deriveEmployeeRecordAuditReadiness(
  lifecycleStatus: WorkforceLifecycleStatus,
  registry: RequirementSetEvaluation
): EmployeeRecordAuditEvaluation {
  if (!isEligibleForComplianceFilters(lifecycleStatus)) {
    return {
      readiness: "not_applicable",
      explanation: "Not currently required — caregiver terminated.",
      registry,
    };
  }

  switch (registry.status) {
    case "expired":
    case "requires_review":
    case "incomplete":
      return { readiness: "blocked", explanation: registry.explanation, registry };
    case "awaiting_verification":
      return { readiness: "awaiting_verification", explanation: registry.explanation, registry };
    case "expiring_soon":
      return { readiness: "expiring_soon", explanation: registry.explanation, registry };
    case "not_applicable":
      return { readiness: "not_applicable", explanation: registry.explanation, registry };
    case "complete":
      return {
        readiness: "ready",
        explanation: "Every Employee Record Audit requirement is satisfied and verified.",
        registry,
      };
  }
}

export async function getEmployeeRecordAuditEvaluation(
  workforceMemberId: string,
  lifecycleStatus: WorkforceLifecycleStatus
): Promise<EmployeeRecordAuditEvaluation> {
  const [set, evidence] = await Promise.all([
    getRequirementSetWithRequirements(WORKFORCE_EMPLOYEE_RECORD_AUDIT_SET_CODE),
    getPersonEvidenceForSubject(SUBJECT_TYPE_WORKFORCE_MEMBER, workforceMemberId),
  ]);

  const requirements = set?.requirements ?? [];
  const registry = evaluateRequirementSetStatus(requirements, evidence);
  return deriveEmployeeRecordAuditReadiness(lifecycleStatus, registry);
}
