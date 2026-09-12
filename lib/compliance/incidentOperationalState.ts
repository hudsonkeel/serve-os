// Incident Corrective Action Lifecycle v0.1 — the incident register's
// operational-state derivation: "What happened? What requires my attention
// next?" reduced to one of six states, built on top of the already-tested
// resolution-eligibility function (lib/compliance/incidentResolutionEligibility.ts)
// rather than re-deriving the underlying rules a second time.
import { getCentralDayBoundaryUtc } from "../utils/date.ts";
import { computeIncidentResolutionEligibility } from "./incidentResolutionEligibility.ts";
import type { ComplianceCorrectiveAction, CorrectiveActionEffectivenessReview, Incident } from "../supabase/types.ts";

export type IncidentOperationalState =
  | "needs_review"
  | "action_required"
  | "follow_up_pending"
  | "effectiveness_due"
  | "ready_to_resolve"
  | "resolved";

// Same "due today or earlier" window Today's Work's own due-date mappers
// use (lib/workspace/mapping.ts), applied here only to decide whether an
// outstanding effectiveness review counts as "due" for register-badge
// purposes — never to recompute eligibility itself.
function isDueOrOverdue(dueAt: string, now: Date): boolean {
  return new Date(dueAt).getTime() < getCentralDayBoundaryUtc(0, now).getTime();
}

export function deriveIncidentOperationalState(
  incident: Pick<Incident, "status" | "review_status" | "follow_up_required">,
  sourceLinkedActions: readonly ComplianceCorrectiveAction[],
  effectivenessReviewsByActionId: ReadonlyMap<string, CorrectiveActionEffectivenessReview>,
  now: Date = new Date()
): IncidentOperationalState {
  if (incident.status === "resolved") return "resolved";

  const eligibility = computeIncidentResolutionEligibility(incident, sourceLinkedActions);
  if (eligibility.eligible) return "ready_to_resolve";

  if (eligibility.blockers.some((b) => b.reason === "not_reviewed")) return "needs_review";
  if (eligibility.blockers.some((b) => b.reason === "no_corrective_action" || b.reason === "all_actions_cancelled")) {
    return "action_required";
  }

  // Every remaining blocker is "corrective_action_incomplete" for a
  // specific action — refine into Action Required (nothing implemented
  // yet) vs. Effectiveness Due (implemented, and its review is due/
  // overdue) vs. Follow-Up Pending (implemented, review scheduled but not
  // yet due, or otherwise still in progress).
  const incompleteActionIds = new Set(
    eligibility.blockers.filter((b) => b.reason === "corrective_action_incomplete").map((b) => b.actionId)
  );
  const incompleteActions = sourceLinkedActions.filter((a) => incompleteActionIds.has(a.id));

  if (incompleteActions.some((a) => a.lifecycle_stage === "open")) return "action_required";

  const anyEffectivenessDueOrOverdue = incompleteActions.some((a) => {
    const review = effectivenessReviewsByActionId.get(a.id);
    if (!review || review.outcome) return false;
    return isDueOrOverdue(review.due_at, now);
  });
  if (anyEffectivenessDueOrOverdue) return "effectiveness_due";

  return "follow_up_pending";
}
