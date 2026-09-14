// Infection Lifecycle & Learning Loop v0.1 — pure eligibility logic for
// "can this infection record be resolved yet?" Mirrors resolve_infection's
// SQL guard (supabase/migrations/20260913000000_add_infection_follow_up_lifecycle.sql)
// exactly, field for field, so this function's test coverage stands in for
// the SQL's own correctness (see lib/compliance/incidentResolutionEligibility.ts
// for the identical convention this follows for Incidents).
//
// Deliberately NOT a copy of Incident's rule, per the revised product
// direction's explicit instruction: Infection follow-up semantics must
// never be forced into the Incident corrective-action resolution model
// merely to maximize code sharing. Two genuinely independent tracks here:
//   - the follow-up LOOP (infectionFollowUpCount / next_follow_up_date) —
//     no Incident analog at all.
//   - the OPTIONAL Serve corrective-action branch — reuses the exact same
//     per-action completion predicate Incident uses
//     (lib/compliance/correctiveActionCompletion.ts), since that part of
//     the underlying mechanism genuinely is shared (both write into
//     compliance_corrective_actions), but a total ABSENCE of any
//     corrective action never blocks here — unlike Incident, where at
//     least one action is mandatory once follow-up is required.
import { allCorrectiveActionsCancelled, isCorrectiveActionSatisfied } from "./correctiveActionCompletion.ts";
import type { ComplianceCorrectiveAction, Infection } from "../supabase/types.ts";

export type InfectionResolutionBlockerReason =
  | "not_reviewed"
  // No follow-up has ever been recorded for a follow-up-required
  // infection — the state every pre-existing follow-up-required infection,
  // including Linda Kaplan's real record, is in immediately after this
  // feature ships (see the migration's design-decision note).
  | "follow_up_not_recorded"
  // Final Migration Tightening — a populated next_follow_up_date, checked
  // UNCONDITIONALLY (see computeInfectionResolutionEligibility below), not
  // only when follow_up_required is currently true. A scheduled follow-up
  // is a real outstanding operational commitment regardless of whatever
  // the review-level follow_up_required flag reads right now.
  | "follow_up_outstanding"
  // Mirrors Incident's identical cancellation-gating decision, applied
  // only when a corrective action happens to exist — never mandatory here.
  | "all_actions_cancelled"
  | "corrective_action_incomplete";

export interface InfectionResolutionBlocker {
  reason: InfectionResolutionBlockerReason;
  // Present only for "corrective_action_incomplete" — which specific
  // action(s) are still open.
  actionId?: string;
}

export interface InfectionResolutionEligibility {
  eligible: boolean;
  blockers: InfectionResolutionBlocker[];
}

export function computeInfectionResolutionEligibility(
  infection: Pick<Infection, "review_status" | "follow_up_required" | "next_follow_up_date">,
  followUpEntryCount: number,
  sourceLinkedActions: readonly ComplianceCorrectiveAction[]
): InfectionResolutionEligibility {
  const blockers: InfectionResolutionBlocker[] = [];

  if (infection.review_status !== "reviewed") {
    blockers.push({ reason: "not_reviewed" });
    // No other state matters until reviewed — return early so callers
    // don't render a half-finished checklist ahead of Review.
    return { eligible: false, blockers };
  }

  // Final Migration Tightening — unconditional: mirrors resolve_infection's
  // own SQL guard, which checks next_follow_up_date before (and
  // independently of) the follow_up_required-gated check below. This
  // closes the bypass sequence where follow-up was required, a follow-up
  // got scheduled, and follow_up_required was later re-affirmed to false
  // without clearing the schedule (mark_infection_reviewed's reaffirm path
  // never touches next_follow_up_date — see its own migration comment).
  if (infection.next_follow_up_date !== null) {
    blockers.push({ reason: "follow_up_outstanding" });
  }

  if (infection.follow_up_required && followUpEntryCount === 0) {
    blockers.push({ reason: "follow_up_not_recorded" });
  }

  // The optional corrective-action branch — evaluated independently of the
  // follow-up loop above, and only when one actually exists.
  if (sourceLinkedActions.length > 0) {
    if (allCorrectiveActionsCancelled(sourceLinkedActions)) {
      blockers.push({ reason: "all_actions_cancelled" });
    } else {
      for (const action of sourceLinkedActions) {
        if (!isCorrectiveActionSatisfied(action)) {
          blockers.push({ reason: "corrective_action_incomplete", actionId: action.id });
        }
      }
    }
  }

  return { eligible: blockers.length === 0, blockers };
}
