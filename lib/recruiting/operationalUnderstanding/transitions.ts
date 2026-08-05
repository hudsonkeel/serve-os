// Transition model — see docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md
// Part 4/§7. Per the approved decision, Transition is NOT persisted: it
// describes movement between two Desired States, named and evaluated
// against the already-computed lifecycle results, never stored as its own
// row unless a later audit requirement justifies it.
import type { DesiredStateEvaluationResult, DesiredStateStatus } from "./types.ts";

export type TransitionDecisionBoundary = "automatic" | "human";
export type TransitionAvailability = "available" | "blocked" | "not_yet_reachable" | "completed";

export interface TransitionDefinition {
  readonly key: string;
  readonly sourceState: string;
  readonly targetState: string;
  readonly purpose: string;
  readonly decisionBoundary: TransitionDecisionBoundary;
  readonly authorizedDecisionMaker: string;
}

export interface TransitionEvaluationResult {
  readonly transitionKey: string;
  readonly sourceState: string;
  readonly targetState: string;
  readonly availability: TransitionAvailability;
  readonly decisionBoundary: TransitionDecisionBoundary;
  readonly explanation: string;
}

// The real chain this project has evidence for today. Each entry's
// decisionBoundary is a restated, explicit version of a rule already
// enforced structurally elsewhere (e.g. Hiring Decision Confirmed can only
// ever be satisfied by a human_confirmation-kind requirement) — naming it
// here makes that boundary independently inspectable without reading the
// Desired State's requirement list.
export const RECRUITING_TRANSITIONS: readonly TransitionDefinition[] = [
  {
    key: "recruiting.transition.application_to_evaluation",
    sourceState: "recruiting.desired_state.application_received",
    targetState: "recruiting.desired_state.candidate_evaluation_complete",
    purpose: "Move from a confirmed application to a completed candidate evaluation.",
    decisionBoundary: "automatic",
    authorizedDecisionMaker: "System — evaluated from directly observed evidence, no human sign-off required to move forward",
  },
  {
    key: "recruiting.transition.evaluation_to_hiring_decision",
    sourceState: "recruiting.desired_state.candidate_evaluation_complete",
    targetState: "recruiting.desired_state.hiring_decision_confirmed",
    purpose: "Move from a completed evaluation to a recorded hiring decision.",
    decisionBoundary: "human",
    authorizedDecisionMaker: "Hiring manager / executive — never automatic, per standing project rule",
  },
  {
    key: "recruiting.transition.hiring_decision_to_employment_record",
    sourceState: "recruiting.desired_state.hiring_decision_confirmed",
    targetState: "recruiting.desired_state.employment_record_confirmed",
    purpose: "Move from a confirmed hiring decision to a confirmed employment record.",
    decisionBoundary: "automatic",
    authorizedDecisionMaker: "System — evaluated from directly observed Viventium evidence or an authorized human confirmation",
  },
  {
    key: "recruiting.transition.employment_record_to_requirements_complete",
    sourceState: "recruiting.desired_state.employment_record_confirmed",
    targetState: "recruiting.desired_state.employment_requirements_complete",
    purpose: "Move from a confirmed employment record to complete employment requirements (I-9/W-4/direct deposit).",
    decisionBoundary: "automatic",
    authorizedDecisionMaker: "System — evaluated from directly observed evidence once each requirement is adopted",
  },
  {
    key: "recruiting.transition.requirements_complete_to_scheduling_ready",
    sourceState: "recruiting.desired_state.employment_requirements_complete",
    targetState: "recruiting.desired_state.scheduling_ready",
    purpose: "Move from complete employment requirements to scheduling readiness.",
    decisionBoundary: "automatic",
    authorizedDecisionMaker: "System — not yet evaluable, no scheduling collector exists",
  },
];

export function evaluateTransition(
  definition: TransitionDefinition,
  results: readonly DesiredStateEvaluationResult[]
): TransitionEvaluationResult {
  const statusByKey = new Map<string, DesiredStateStatus>(results.map((r) => [r.desiredStateKey, r.status]));
  const sourceStatus = statusByKey.get(definition.sourceState);
  const targetStatus = statusByKey.get(definition.targetState);

  let availability: TransitionAvailability;
  let explanation: string;

  if (targetStatus === "satisfied") {
    availability = "completed";
    explanation = `${definition.purpose} — already completed.`;
  } else if (targetStatus === "blocked") {
    availability = "blocked";
    explanation = `${definition.purpose} — blocked. See the target state's gaps for why.`;
  } else if (sourceStatus === "satisfied") {
    availability = "available";
    explanation = `${definition.purpose} — the source state is satisfied; this transition can be evaluated now.`;
  } else {
    availability = "not_yet_reachable";
    explanation = `${definition.purpose} — the source state is not yet satisfied.`;
  }

  return {
    transitionKey: definition.key,
    sourceState: definition.sourceState,
    targetState: definition.targetState,
    availability,
    decisionBoundary: definition.decisionBoundary,
    explanation,
  };
}

export function evaluateRecruitingTransitions(results: readonly DesiredStateEvaluationResult[]): TransitionEvaluationResult[] {
  return RECRUITING_TRANSITIONS.map((def) => evaluateTransition(def, results));
}
