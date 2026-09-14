// Shared leaf logic for "is this source-linked corrective action done?" —
// extracted from lib/compliance/incidentResolutionEligibility.ts (Infection
// Lifecycle & Learning Loop v0.1 reuse review) so Incident and Infection's
// own, separately-reasoned top-level resolution rules can both build on the
// exact same per-action completion predicate without one being copy-pasted
// from the other. This module makes no judgment about what a domain
// requires overall (e.g. "at least one action must exist") — only "given
// this one action, is it satisfied" and "given this set, were they all
// cancelled." incidentResolutionEligibility.ts's own tests continue to
// cover this logic's behavior end-to-end; see
// lib/compliance/__tests__/correctiveActionCompletion.test.ts for this
// module's own direct coverage.
import type { ComplianceCorrectiveAction } from "../supabase/types.ts";

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
export function isCorrectiveActionSatisfied(action: ComplianceCorrectiveAction): boolean {
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

// Cancellation-gating decision (Incident Corrective Action Lifecycle v0.1):
// withdrawing every action is not the same as completing the requirement —
// only when EVERY action in a non-empty set was cancelled, with nothing
// ever actually completed, should a caller treat this as equivalent to no
// corrective action existing at all. A mix of cancelled and completed
// actions is fine (the completed one(s) satisfy the requirement).
export function allCorrectiveActionsCancelled(actions: readonly ComplianceCorrectiveAction[]): boolean {
  return actions.length > 0 && actions.every((action) => action.lifecycle_stage === "cancelled");
}
