import { buildBackgroundEligibilityDecisionSpec } from "../domains/compliance/backgroundEligibility/decisionSpec.ts";
import type { BackgroundEligibilityEvaluationInput } from "../domains/compliance/backgroundEligibility/decisionSpec.ts";
import type { DecisionTypeHandler } from "./types.ts";

// The one registry every decision type plugs into. Background Eligibility
// is the first entry — not a special case, just the first one. A second
// decision type (Phase 2) adds a second entry here and nowhere else in
// this file changes.
export const DECISION_TYPE_REGISTRY = {
  background_eligibility: buildBackgroundEligibilityDecisionSpec as DecisionTypeHandler<BackgroundEligibilityEvaluationInput>,
};

export type DecisionType = keyof typeof DECISION_TYPE_REGISTRY;
