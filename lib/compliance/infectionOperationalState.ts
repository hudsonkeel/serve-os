// Infection Lifecycle & Learning Loop v0.1 — the infection register's
// operational-state derivation, mirroring
// lib/compliance/incidentOperationalState.ts's own convention (built on
// top of the already-tested resolution-eligibility function rather than
// re-deriving the underlying rules a second time) — but with its own,
// differently-shaped state set. No "effectiveness_due" state exists here
// at the infection level: effectiveness review, when it appears, always
// belongs to the optional corrective action, never to the infection
// itself — see corrective_action_incomplete below, which covers that whole
// branch without needing to distinguish "awaiting implementation" from
// "awaiting effectiveness review" the way Incident's richer, corrective-
// action-centric model does.
import { isBusinessDateDueTodayOrEarlier } from "../utils/date.ts";
import { computeInfectionResolutionEligibility } from "./infectionResolutionEligibility.ts";
import type { ComplianceCorrectiveAction, Infection } from "../supabase/types.ts";

export type InfectionOperationalState =
  | "needs_review"
  | "follow_up_needed"
  | "follow_up_due"
  | "follow_up_scheduled"
  | "corrective_action_incomplete"
  | "ready_to_resolve"
  | "resolved";

export function deriveInfectionOperationalState(
  infection: Pick<Infection, "status" | "review_status" | "follow_up_required" | "next_follow_up_date">,
  followUpEntryCount: number,
  sourceLinkedActions: readonly ComplianceCorrectiveAction[],
  now: Date = new Date()
): InfectionOperationalState {
  if (infection.status === "resolved") return "resolved";

  const eligibility = computeInfectionResolutionEligibility(infection, followUpEntryCount, sourceLinkedActions);
  if (eligibility.eligible) return "ready_to_resolve";

  if (eligibility.blockers.some((b) => b.reason === "not_reviewed")) return "needs_review";

  // Follow-Up & Resolution UX Refinement (live-validation fix) — a
  // populated next_follow_up_date is checked BEFORE "zero entries
  // recorded," not after. Both blockers can be simultaneously true (a
  // follow-up was scheduled via schedule_infection_follow_up before any
  // observation was ever recorded — the normal, expected order of
  // operations), and once a real date is scheduled, that is an active,
  // governed plan, not an unaddressed gap: it must read as
  // follow_up_scheduled/follow_up_due, never fall back to follow_up_needed.
  // The original order here (follow_up_not_recorded checked first) is what
  // produced the live-validation bug where Linda Kaplan's Resolution card
  // kept showing "Follow-Up Needed" after her follow-up was scheduled,
  // even though the Infection Follow-Up section itself already reflected
  // the new date correctly (proving the data layer was fine and this was
  // purely a presentation/state-derivation ordering issue).
  if (eligibility.blockers.some((b) => b.reason === "follow_up_outstanding")) {
    return infection.next_follow_up_date && isBusinessDateDueTodayOrEarlier(infection.next_follow_up_date, now)
      ? "follow_up_due"
      : "follow_up_scheduled";
  }
  if (eligibility.blockers.some((b) => b.reason === "follow_up_not_recorded")) return "follow_up_needed";
  // Only "all_actions_cancelled" / "corrective_action_incomplete" blockers
  // remain — both belong to the optional corrective-action branch.
  return "corrective_action_incomplete";
}
