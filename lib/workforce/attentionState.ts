// Attention-Driven Operations (Phase 1C), corrected under the Workforce
// Lifecycle Boundary phase — replaces "Blocked" as the roster's primary
// operational concept. Pure, derived entirely from the same per-requirement
// evaluations the already-shipped engine already produces
// (lib/compliance/requirementSetStatus.ts) — no new evaluation logic, only
// a new interpretation of existing output.
//
// The governing rule, corrected here: lifecycle eligibility is decided
// FIRST, before any requirement is even inspected —
//
//   Lifecycle eligibility -> requirement evaluation -> evidence assurance
//   -> attention state
//
// never "no open issues -> Ready." "Ready" is an operational-readiness
// state for a person currently in scope to work; it is not merely "nothing
// is currently flagged." A terminated or inactive person with a perfectly
// clean historical record must never read as Ready — a clean record for
// them just means there's nothing left to chase, not that they're
// available to work today.
//
// Precedence among the 4 "real" (active-workforce) states — deliberately
// NOT the same ordering as raw severity would suggest (a rejected
// background check reads as more urgent than a registry check expiring in
// three weeks). Action Needed and Due Soon are both "the evidence itself is
// running out or absent" problems — the core compliance-gap risk — and rank
// above Review, which is "something exists and needs a human's judgment
// call," and above Waiting, which is "something exists and needs a human's
// confirmation." This ordering mirrors the product's own stated card
// ordering (Action Needed, Due Soon, Review, Waiting, Ready) exactly.
import type { RequirementEvaluation } from "../compliance/requirementSetStatus.ts";
import type { WorkforceLifecycleStatus } from "./lifecycleStatus.ts";

export type AttentionState = "action_needed" | "due_soon" | "review" | "waiting" | "ready" | "not_applicable";

// Higher rank sorts first — "the safest employees naturally fall toward
// the bottom because they require no attention." not_applicable ranks
// below ready — someone out of scope for active work isn't "safer" than an
// active, fully-ready caregiver; they're simply not part of the population
// this ranking is about, and sink to the very bottom of any unfiltered
// list.
export const ATTENTION_STATE_RANK: Record<AttentionState, number> = {
  action_needed: 5,
  due_soon: 4,
  review: 3,
  waiting: 2,
  ready: 1,
  not_applicable: 0,
};

export interface AttentionEvaluation {
  state: AttentionState;
  explanation: string;
}

// Only a currently active workforce member can ever be operationally
// "Ready." Terminated and inactive people are excluded from the active
// workforce population entirely (by default — no policy in this codebase
// yet requires ongoing attention for either). Pending-start people haven't
// started, so a clean record for them means "ready to begin," which is
// deliberately kept distinct from active Ready — see deriveAttentionState().
export function isActiveWorkforce(status: WorkforceLifecycleStatus): boolean {
  return status === "active";
}

// Per-requirement attention state (satisfied maps to "ready", rather than
// being skipped) — used at Level 2/3 to badge a single requirement row.
// Deliberately lifecycle-agnostic: a terminated or inactive person's
// per-requirement history is still real audit detail and displays exactly
// as evaluated, never suppressed — only the member-level AGGREGATE below
// enforces the lifecycle boundary. This function can never return
// not_applicable; that value only ever describes a whole person, not a
// single requirement.
export function attentionStateForRequirement(evaluation: RequirementEvaluation): AttentionState {
  return attentionStateForRequirementStatus(evaluation.status) ?? "ready";
}

function attentionStateForRequirementStatus(status: RequirementEvaluation["status"]): AttentionState | null {
  switch (status) {
    case "missing":
    case "expired":
      return "action_needed";
    case "expiring_soon":
      return "due_soon";
    case "requires_review":
      return "review";
    case "awaiting_verification":
      return "waiting";
    case "satisfied":
      return null;
  }
}

function worstRequirementAttention(
  requirements: readonly RequirementEvaluation[]
): { state: AttentionState; evaluation: RequirementEvaluation } | null {
  let worst: { state: AttentionState; evaluation: RequirementEvaluation } | null = null;
  for (const evaluation of requirements) {
    const state = attentionStateForRequirementStatus(evaluation.status);
    if (state === null) continue;
    if (!worst || ATTENTION_STATE_RANK[state] > ATTENTION_STATE_RANK[worst.state]) {
      worst = { state, evaluation };
    }
  }
  return worst;
}

export function deriveAttentionState(
  lifecycleStatus: WorkforceLifecycleStatus,
  requirements: readonly RequirementEvaluation[]
): AttentionEvaluation {
  // Terminated: retains every historical requirement, evidence, and action
  // for inspection, but is permanently out of scope for active operational
  // attention — missing evidence never becomes an "ordinary" onboarding-
  // style action for someone no longer employed.
  if (lifecycleStatus === "terminated") {
    return {
      state: "not_applicable",
      explanation: "Terminated — no longer part of the active workforce; retained for historical audit only.",
    };
  }

  // Inactive: same treatment as terminated by default — excluded from
  // active-workforce attention and Ready totals. This codebase has no
  // policy today that requires ongoing attention for an inactive record;
  // when one exists, it should be threaded through here explicitly rather
  // than inferred from "an issue exists."
  if (lifecycleStatus === "inactive") {
    return {
      state: "not_applicable",
      explanation: "Inactive — excluded from active workforce readiness by default.",
    };
  }

  const worst = worstRequirementAttention(requirements);

  // Pending start: real onboarding work still surfaces (a genuinely
  // outstanding requirement is real, actionable checklist work), but a
  // fully clean pending-start record is "ready to begin," never Active
  // Ready — those are different claims and must not collapse into one
  // vocabulary. A fully separate Onboarding / Ready-to-Start vocabulary is
  // real future work, not built here; this is the minimal correct
  // boundary in the meantime.
  if (lifecycleStatus === "pending_start") {
    if (!worst) {
      return { state: "not_applicable", explanation: "Pending start — ready to begin once started; not part of Active Ready." };
    }
    return { state: worst.state, explanation: worst.evaluation.explanation };
  }

  // Active — the only lifecycle status eligible for the real "ready" state.
  if (!worst) {
    return { state: "ready", explanation: "Every Employee Record Audit requirement is satisfied and verified." };
  }
  return { state: worst.state, explanation: worst.evaluation.explanation };
}
