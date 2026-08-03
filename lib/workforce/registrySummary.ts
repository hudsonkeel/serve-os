// Workforce's own Domain Interpretation of the shared Compliance Status
// layer (lib/compliance/requirementSetStatus.ts), now also accounting for
// the derived Workforce lifecycle status (lib/workforce/lifecycleStatus.ts).
// Pure, no I/O — this is presentation/applicability logic, never a second
// evidence model: the underlying person_evidence rows and their real
// verification/lifecycle_status are never touched by anything here.
import type { RequirementEvaluation, RequirementSetEvaluation } from "../compliance/requirementSetStatus.ts";
import type { WorkforceLifecycleStatus } from "./lifecycleStatus.ts";

export type RequirementDisplayStatus = RequirementEvaluation["status"] | "not_currently_required";

export interface RequirementDisplay {
  requirement: RequirementEvaluation["requirement"];
  displayStatus: RequirementDisplayStatus;
  displayExplanation: string;
  latestEvidence: RequirementEvaluation["latestEvidence"];
}

// A terminated caregiver's history stays exactly as computed — satisfied,
// awaiting_verification, requires_review, and expired all pass through
// unchanged, because "Do not delete or suppress historical verified
// evidence" applies to all of those, not just satisfied ones. Only a
// genuinely *missing* requirement (nothing on file at all) is reinterpreted
// — that's the one case that would otherwise read as an active compliance
// deficiency for someone no longer working here.
export function resolveRequirementDisplay(
  evaluation: RequirementEvaluation,
  lifecycleStatus: WorkforceLifecycleStatus
): RequirementDisplay {
  if (lifecycleStatus === "terminated" && evaluation.status === "missing") {
    return {
      requirement: evaluation.requirement,
      displayStatus: "not_currently_required",
      displayExplanation: "Not currently required — caregiver terminated.",
      latestEvidence: evaluation.latestEvidence,
    };
  }
  return {
    requirement: evaluation.requirement,
    displayStatus: evaluation.status,
    displayExplanation: evaluation.explanation,
    latestEvidence: evaluation.latestEvidence,
  };
}

export interface WorkforceRegistrySummaryInput {
  lifecycleStatus: WorkforceLifecycleStatus;
  registry: RequirementSetEvaluation;
}

export interface WorkforceRegistrySummary {
  active: number;
  inactive: number;
  terminated: number;
  pendingStart: number;
  // Every count below excludes terminated caregivers entirely — they
  // remain searchable and available on their own profile for historical
  // audit, but never count toward current compliance totals.
  narComplete: number;
  emrComplete: number;
  bothComplete: number;
  awaitingVerification: number;
  missingEvidence: number;
  complianceEligibleCount: number;
}

function isCurrentlyRequiredEligible(status: WorkforceLifecycleStatus): boolean {
  return status !== "terminated";
}

export function summarizeWorkforceRegistry(
  entries: readonly WorkforceRegistrySummaryInput[]
): WorkforceRegistrySummary {
  const eligible = entries.filter((e) => isCurrentlyRequiredEligible(e.lifecycleStatus));

  return {
    active: entries.filter((e) => e.lifecycleStatus === "active").length,
    inactive: entries.filter((e) => e.lifecycleStatus === "inactive").length,
    terminated: entries.filter((e) => e.lifecycleStatus === "terminated").length,
    pendingStart: entries.filter((e) => e.lifecycleStatus === "pending_start").length,
    narComplete: eligible.filter(
      (e) => e.registry.requirements.find((r) => r.requirement.requirement_code === "TX_NAR_SEARCH")?.status === "satisfied"
    ).length,
    emrComplete: eligible.filter(
      (e) => e.registry.requirements.find((r) => r.requirement.requirement_code === "TX_EMR_SEARCH")?.status === "satisfied"
    ).length,
    bothComplete: eligible.filter((e) => e.registry.status === "complete").length,
    awaitingVerification: eligible.filter((e) => e.registry.status === "awaiting_verification").length,
    missingEvidence: eligible.filter((e) => e.registry.status === "incomplete").length,
    complianceEligibleCount: eligible.length,
  };
}

// Used by the roster table's filter tabs (Missing NAR / Missing EMR / NAR
// Complete / EMR Complete / Awaiting Verification / Registry Evidence
// Complete) to apply the same terminated-exclusion rule the summary tiles
// use, so the two surfaces can never disagree about who counts.
export function isEligibleForComplianceFilters(lifecycleStatus: WorkforceLifecycleStatus): boolean {
  return isCurrentlyRequiredEligible(lifecycleStatus);
}
