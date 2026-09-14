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
//
// The per-action "is it done" / "were they all cancelled" predicates live
// in lib/compliance/correctiveActionCompletion.ts (Infection Lifecycle &
// Learning Loop v0.1 reuse review) — shared with
// lib/compliance/infectionResolutionEligibility.ts's own, differently-shaped
// top-level rule. This module's own top-level rule (review gate, "at least
// one action must exist," early-return shape) stays Incident-specific by
// deliberate choice — Infection's follow-up-loop-first rule is genuinely
// different, not a copy-paste candidate.
import { allCorrectiveActionsCancelled, isCorrectiveActionSatisfied } from "./correctiveActionCompletion.ts";
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
  if (allCorrectiveActionsCancelled(sourceLinkedActions)) {
    blockers.push({ reason: "all_actions_cancelled" });
    return { eligible: false, blockers };
  }

  for (const action of sourceLinkedActions) {
    if (!isCorrectiveActionSatisfied(action)) {
      blockers.push({ reason: "corrective_action_incomplete", actionId: action.id });
    }
  }

  return { eligible: blockers.length === 0, blockers };
}
