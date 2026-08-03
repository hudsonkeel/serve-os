// Turns an Employee Record Audit evaluation into operational work — the
// "Action Generation" the product mission asks for. The mapping from
// requirement status to action is pure and tested; the sync itself is I/O
// (create/refresh/close workforce_compliance_actions rows) and is called
// after every evidence-affecting mutation and on every profile view, so
// readiness and open work can never drift apart without a human noticing.
import type { RequirementEvaluation } from "../compliance/requirementSetStatus.ts";
import type { WorkforceComplianceActionPriority, WorkforceComplianceActionType } from "../supabase/types.ts";
import {
  autoResolveComplianceActionsForRequirement,
  closeAllOpenComplianceActionsForMember,
  syncComplianceAction,
} from "../data/workforceComplianceActions.ts";
import type { WorkforceLifecycleStatus } from "./lifecycleStatus.ts";

export interface ComplianceActionMapping {
  actionType: WorkforceComplianceActionType;
  priority: WorkforceComplianceActionPriority;
  title: (requirementName: string) => string;
}

// Every genuinely actionable problem state generates exactly one action,
// titled as the imperative next step rather than a description of the
// problem — this is what Level 1/2 surfaces as the employee's Next Best
// Action. Priority is aligned to the Attention State precedence
// (lib/workforce/attentionState.ts) so the two never disagree: Action
// Needed (missing/expired) = urgent, Due Soon (expiring_soon) = high,
// Review (requires_review) = normal, Waiting (awaiting_verification) =
// low. 'satisfied' never generates work.
//
// 'awaiting_verification' now generates a (low-priority) action —
// reversing Phase 1B's original decision that this would be
// "recommendation fatigue" since the evidence is already visible on its
// own requirement card. The Phase 1C mission explicitly requires a
// surfaced Next Best Action like "Verify Form I-9," which can only come
// from this state, so the roster and detail views need a real action
// object to point to, not just a card that happens to be present.
export function mapRequirementStatusToComplianceAction(
  status: RequirementEvaluation["status"]
): ComplianceActionMapping | null {
  switch (status) {
    case "missing":
      return { actionType: "evidence_missing", priority: "urgent", title: (name) => `Upload ${name}` };
    case "expired":
      return { actionType: "evidence_expired", priority: "urgent", title: (name) => `Renew ${name}` };
    case "expiring_soon":
      return { actionType: "evidence_expiring_soon", priority: "high", title: (name) => `Renew ${name} before it expires` };
    case "requires_review":
      return { actionType: "evidence_requires_review", priority: "normal", title: (name) => `Review ${name}` };
    case "awaiting_verification":
      return { actionType: "evidence_awaiting_verification", priority: "low", title: (name) => `Verify ${name}` };
    case "satisfied":
      return null;
  }
}

// Reconciles open workforce_compliance_actions against a fresh evaluation:
// creates/refreshes one action per still-open problem, closes any action
// whose requirement is now satisfied (or no longer applicable). Idempotent
// — safe to call on every page view, not only after a mutation.
//
// Terminated and inactive members have their open actions closed outright
// rather than evaluated per requirement — under the Workforce Lifecycle
// Boundary, neither is part of the active workforce by default, so missing
// evidence must never generate an "ordinary" onboarding-style action for
// either. (Inactive gets the same treatment as terminated here; if a real
// policy ever requires ongoing attention for inactive records, it should be
// threaded through explicitly rather than inferred from "an issue exists.")
// Pending-start members are NOT suppressed — their outstanding requirements
// are real onboarding checklist work and should keep generating actions
// exactly like an active member's.
export async function syncWorkforceComplianceActionsForMember(
  workforceMemberId: string,
  lifecycleStatus: WorkforceLifecycleStatus,
  requirementEvaluations: readonly RequirementEvaluation[],
  actor: string
): Promise<void> {
  if (lifecycleStatus === "terminated") {
    await closeAllOpenComplianceActionsForMember(workforceMemberId, "No longer applicable — employment ended.");
    return;
  }
  if (lifecycleStatus === "inactive") {
    await closeAllOpenComplianceActionsForMember(workforceMemberId, "No longer applicable — caregiver is inactive.");
    return;
  }

  for (const evaluation of requirementEvaluations) {
    const mapping = mapRequirementStatusToComplianceAction(evaluation.status);

    if (mapping) {
      await syncComplianceAction({
        workforceMemberId,
        requirementId: evaluation.requirement.id,
        actionType: mapping.actionType,
        title: mapping.title(evaluation.requirement.name),
        reason: evaluation.explanation,
        priority: mapping.priority,
        dueAt: evaluation.status === "expiring_soon" ? (evaluation.latestEvidence?.expiration_date ?? null) : null,
        actor,
      });
    } else {
      await autoResolveComplianceActionsForRequirement(workforceMemberId, evaluation.requirement.id);
    }
  }
}
