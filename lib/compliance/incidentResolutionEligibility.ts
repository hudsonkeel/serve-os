// Incident Corrective Action Lifecycle v0.1 — pure eligibility logic for
// "can this incident be resolved yet?" Mirrors resolve_incident's SQL
// guard (supabase/migrations/20260910000000_add_incident_corrective_action_lifecycle.sql)
// exactly, field for field, so this function's test coverage stands in for
// the SQL's own correctness (this codebase tests business logic as pure
// functions, never against a live database — see lib/qapi/__tests__/signals.test.ts
// and lib/compliance/__tests__/correctiveActionComposition.test.ts for the
// established convention). The RPC re-asserts the same rule server-side —
// this is what renders the Resolution card's checklist and must never be
// the only enforcement layer.
import type { ComplianceCorrectiveAction, Incident } from "../supabase/types.ts";

export type IncidentResolutionBlockerReason =
  | "not_reviewed"
  | "no_corrective_action"
  // Cancellation-gating decision — withdrawing every action is not the
  // same as completing the follow-up requirement. Distinct from
  // "no_corrective_action" only so the UI can explain *why* (actions
  // exist, but none of them were ever completed) rather than implying
  // none were ever created.
  | "all_actions_cancelled"
  | "corrective_action_incomplete";

export interface IncidentResolutionBlocker {
  reason: IncidentResolutionBlockerReason;
  // Present only for "corrective_action_incomplete" — which specific
  // action(s) are still open.
  actionId?: string;
}

export interface IncidentResolutionEligibility {
  eligible: boolean;
  blockers: IncidentResolutionBlocker[];
}

// A source-linked action stops blocking when:
//   - it was cancelled (explicit, reasoned withdrawal — never blocks), or
//   - it requires effectiveness verification and has reached
//     verified_effective (status resolved/dismissed alone is NOT
//     sufficient — the generic path must never silently stand in for a
//     completed effectiveness review), or
//   - it does not require effectiveness verification and is
//     implemented/verified_effective, or was closed via the generic
//     resolved/dismissed path (the still-valid original mechanism, since
//     there is no verification step to bypass).
function isActionSatisfied(action: ComplianceCorrectiveAction): boolean {
  if (action.lifecycle_stage === "cancelled") return true;

  if (action.effectiveness_review_required) {
    return action.lifecycle_stage === "verified_effective";
  }

  return (
    action.lifecycle_stage === "implemented" ||
    action.lifecycle_stage === "verified_effective" ||
    action.status === "resolved" ||
    action.status === "dismissed"
  );
}

export function computeIncidentResolutionEligibility(
  incident: Pick<Incident, "review_status" | "follow_up_required">,
  sourceLinkedActions: readonly ComplianceCorrectiveAction[]
): IncidentResolutionEligibility {
  const blockers: IncidentResolutionBlocker[] = [];

  if (incident.review_status !== "reviewed") {
    blockers.push({ reason: "not_reviewed" });
    // No corrective-action state matters until reviewed — return early so
    // callers don't render a half-finished checklist ahead of Review.
    return { eligible: false, blockers };
  }

  if (!incident.follow_up_required) {
    return { eligible: true, blockers: [] };
  }

  if (sourceLinkedActions.length === 0) {
    blockers.push({ reason: "no_corrective_action" });
    return { eligible: false, blockers };
  }

  // Cancellation-gating decision: a mix of cancelled and completed actions
  // is fine (the completed one(s) satisfy the requirement) — only when
  // EVERY action was cancelled, with nothing ever actually completed, is
  // resolution blocked as if no corrective action existed at all.
  if (sourceLinkedActions.every((action) => action.lifecycle_stage === "cancelled")) {
    blockers.push({ reason: "all_actions_cancelled" });
    return { eligible: false, blockers };
  }

  for (const action of sourceLinkedActions) {
    if (!isActionSatisfied(action)) {
      blockers.push({ reason: "corrective_action_incomplete", actionId: action.id });
    }
  }

  return { eligible: blockers.length === 0, blockers };
}
