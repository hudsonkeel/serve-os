// Capability model — see docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md
// Part 3/§6. Per the approved decision, Capability is NOT a stored
// primitive: it is a versioned, derived evaluation over already-satisfied
// Desired States, computed the same way a Desired State itself is —
// pure, no I/O, fully explainable. No new table.
//
// The one rule every CapabilityDefinition exists to enforce structurally:
// a Desired State becoming satisfied grants ONLY the capability explicitly
// gated on it — never every plausible downstream capability. Employment
// Record Confirmed grants "may continue onboarding," never payroll or
// scheduling capability, even though a careless reader might assume it.
import type { DesiredStateEvaluationResult, DesiredStateStatus } from "./types.ts";

export type CapabilityStatus = "granted" | "not_granted" | "unknown";

export interface CapabilityDefinition {
  readonly key: string;
  readonly title: string;
  readonly operationalMeaning: string;
  // Every one of these Desired States must be `satisfied` for the
  // capability to be granted — an explicit, minimal, reviewable list,
  // never inferred from "this seems like the next logical step."
  readonly requiredSatisfiedStates: readonly string[];
  readonly governingAuthority: string;
  readonly downstreamActionsEnabled: readonly string[];
  readonly risksOfIncorrectActivation: readonly string[];
}

export interface CapabilityEvaluationResult {
  readonly capabilityKey: string;
  readonly title: string;
  readonly status: CapabilityStatus;
  readonly explanation: string;
  readonly requiredSatisfiedStates: readonly string[];
  readonly unsatisfiedStates: readonly string[];
}

// The first, deliberately small reference set — exactly the three states
// this project has real evidence for, proving the "does not overgrant"
// principle rather than exhaustively modeling every future capability.
export const WORKFORCE_CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    key: "workforce.may_continue_employment_onboarding",
    title: "May continue employment onboarding",
    operationalMeaning: "Serve may proceed with onboarding steps for this person — it does not yet mean they may be paid or scheduled.",
    requiredSatisfiedStates: ["recruiting.desired_state.employment_record_confirmed"],
    governingAuthority: "Derived directly from Employment Record Confirmed — no separate adoption required.",
    downstreamActionsEnabled: ["Continue collecting employment requirement evidence (I-9, W-4, direct deposit)."],
    risksOfIncorrectActivation: ["None material — onboarding continuation carries no payroll/safety consequence by itself."],
  },
  {
    key: "workforce.may_receive_payroll",
    title: "May receive payroll",
    operationalMeaning: "Serve considers this person's payroll setup complete enough to be paid.",
    requiredSatisfiedStates: ["recruiting.desired_state.employment_requirements_complete"],
    governingAuthority: "Derived from Employment Requirements Complete — gated on I-9/W-4/direct-deposit, none of which are adopted-blocking yet in this project.",
    downstreamActionsEnabled: ["Initiate payroll enrollment."],
    risksOfIncorrectActivation: ["Paying someone without complete, compliant paperwork is a real regulatory/financial risk — this capability must never be granted merely because Employment Record Confirmed is satisfied."],
  },
  {
    key: "workforce.may_be_assigned_to_client",
    title: "May be assigned to a client",
    operationalMeaning: "Serve considers this person ready to be scheduled for care delivery.",
    requiredSatisfiedStates: ["recruiting.desired_state.scheduling_ready"],
    governingAuthority: "Derived from Scheduling Ready — currently not_applicable for every real lead, since no scheduling collector exists yet.",
    downstreamActionsEnabled: ["Create a schedule/visit assignment."],
    risksOfIncorrectActivation: ["Assigning an unqualified/uncleared person to deliver care to a resident is a direct safety risk — this capability must never be granted from Employment-lifecycle evidence alone."],
  },
];

export function evaluateCapability(
  definition: CapabilityDefinition,
  desiredStateResults: readonly DesiredStateEvaluationResult[]
): CapabilityEvaluationResult {
  const statusByKey = new Map<string, DesiredStateStatus>(desiredStateResults.map((r) => [r.desiredStateKey, r.status]));

  const unsatisfiedStates = definition.requiredSatisfiedStates.filter((key) => statusByKey.get(key) !== "satisfied");

  let status: CapabilityStatus;
  let explanation: string;
  if (unsatisfiedStates.length === 0) {
    status = "granted";
    explanation = `${definition.title}: granted — every required Desired State is satisfied.`;
  } else if (unsatisfiedStates.some((key) => statusByKey.get(key) === "blocked")) {
    status = "not_granted";
    explanation = `${definition.title}: not granted — ${unsatisfiedStates.filter((k) => statusByKey.get(k) === "blocked").join(", ")} is blocked.`;
  } else {
    status = "unknown";
    explanation = `${definition.title}: not yet determinable — ${unsatisfiedStates.join(", ")} not yet satisfied.`;
  }

  return {
    capabilityKey: definition.key,
    title: definition.title,
    status,
    explanation,
    requiredSatisfiedStates: definition.requiredSatisfiedStates,
    unsatisfiedStates,
  };
}

export function evaluateWorkforceCapabilities(
  desiredStateResults: readonly DesiredStateEvaluationResult[]
): CapabilityEvaluationResult[] {
  return WORKFORCE_CAPABILITIES.map((def) => evaluateCapability(def, desiredStateResults));
}
