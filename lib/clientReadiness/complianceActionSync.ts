// Turns a Client Readiness evaluation into operational work for
// authorized reviewers — the resident-domain analog of
// lib/workforce/complianceActionSync.ts. Writes into
// compliance_corrective_actions (lib/data/complianceCorrectiveActions.ts,
// already the table Today's Work reads for resident-subject items and
// already documented as intended for "Client File Readiness" — see that
// file's own header), never a new table or task model.
//
// Deliberately narrower than Workforce's mapping: only "needs_review"
// (Awaiting Verification, in the office_staff-facing vocabulary) creates
// an action here. Missing evidence is explicitly excluded — see the
// mapping function's own comment — because collecting evidence is
// office_staff's ordinary job, not something a reviewer needs a work
// queue entry to be reminded of; the verifier handoff exists specifically
// for the moment a reviewer's judgment becomes the remaining step.
import { autoResolveCorrectiveActionsForRequirement, syncCorrectiveAction } from "../data/complianceCorrectiveActions.ts";
import type { AuditReadinessStatus } from "../compliance/auditReadinessStatus.ts";
import type { ClientReadinessRequirementEvaluation } from "./clientReadinessReadiness.ts";
import type { ComplianceCorrectiveActionPriority, ComplianceCorrectiveActionType } from "../supabase/types.ts";

export interface ClientReadinessComplianceActionMapping {
  actionType: ComplianceCorrectiveActionType;
  priority: ComplianceCorrectiveActionPriority;
  title: (requirementName: string, subjectLabel: string) => string;
}

// Note: AuditReadinessStatus's "needs_review" collapses two distinct
// engine-level outcomes — evidence awaiting its first verification, and
// evidence a reviewer already rejected (which routes back to
// "requires_review" at the engine level, since the underlying resident
// evidence types don't expose the raw engine status the way Workforce's
// evaluation does). Both genuinely need a reviewer's attention, so both
// produce the same "Verify {name}" handoff here — a minor imprecision
// (a rejected item isn't literally awaiting a first verification)
// accepted deliberately rather than plumbing the raw engine status
// through Client Readiness's public evaluation shape for this alone.
export function mapClientReadinessStatusToComplianceAction(
  status: AuditReadinessStatus
): ClientReadinessComplianceActionMapping | null {
  if (status !== "needs_review") return null;
  return {
    actionType: "evidence_awaiting_verification",
    priority: "low",
    title: (requirementName, subjectLabel) => `Verify ${requirementName} — ${subjectLabel}`,
  };
}

// Next business day (skips Sat/Sun) — the default due date every newly
// Awaiting-Verification action gets. Deliberately short: this is a
// hand-off that should be resolved promptly, not a renewal with months
// of runway. Once due, mapCorrectiveActionToWorkItem's own existing
// overdue logic (lib/workspace/mapping.ts) makes it increasingly
// prominent in Today's Work with no new escalation code required.
export function nextBusinessDayIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + 1);
  const day = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

// Reconciles open compliance_corrective_actions for one resident against
// a fresh Client Readiness evaluation — creates/refreshes one action per
// still-open "needs_review" requirement, closes any action whose
// requirement has moved on (satisfied, or reverted to missing/overdue,
// per autoResolveCorrectiveActionsForRequirement's own idempotent
// close-if-open semantics). Mirrors
// syncWorkforceComplianceActionsForMember's exact idempotent, safe-to-
// call-on-every-mutation shape. domain is "client_readiness", matching
// this table's own intended "Client File Readiness" consumer.
export async function syncClientReadinessComplianceActionsForResident(
  residentId: string,
  subjectLabel: string,
  requirementEvaluations: readonly ClientReadinessRequirementEvaluation[],
  actor: string
): Promise<void> {
  const dueAt = nextBusinessDayIso();

  for (const evaluation of requirementEvaluations) {
    const mapping = mapClientReadinessStatusToComplianceAction(evaluation.status);

    if (mapping) {
      await syncCorrectiveAction({
        subjectType: "resident",
        subjectId: residentId,
        requirementId: evaluation.requirement.id,
        domain: "client_readiness",
        actionType: mapping.actionType,
        title: mapping.title(evaluation.requirement.name, subjectLabel),
        reason: evaluation.explanation,
        priority: mapping.priority,
        dueAt,
        actor,
      });
    } else {
      await autoResolveCorrectiveActionsForRequirement("resident", residentId, evaluation.requirement.id);
    }
  }
}
