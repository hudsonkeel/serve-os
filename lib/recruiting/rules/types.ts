import type { InferenceStrength, RecruitingLeadObservation } from "../../supabase/types.ts";

// Shared shape every recruiting-domain rule returns. A rule NEVER creates
// operational state — it only proposes a narrowly-scoped inference from
// directly observed evidence, always citing exactly which observations
// support it, never asserting more than the evidence shows. See
// docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md Phase 4/5.
export interface RuleResult {
  readonly signalKey: string;
  readonly explanation: string;
  readonly strength: InferenceStrength;
  readonly unresolvedAlternatives: readonly string[];
  readonly evidenceNeededToResolve: readonly string[];
  readonly supportingObservationIds: readonly string[];
}

// A rule's evaluate() is a pure function: observations in, RuleResult (or
// null if it doesn't fire) out. No I/O, no persistence — that's the
// orchestrator's (evaluateRecruitingLeadRules.ts) job, which is what makes
// every rule independently unit-testable with plain fixture arrays.
export type RuleEvaluator = (observations: readonly RecruitingLeadObservation[]) => RuleResult | null;

export interface RuleDefinition {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly version: number;
  readonly logicReference: string;
  readonly evaluate: RuleEvaluator;
}

// Helper every rule uses: find the most recent observation for a key that
// resolved to a specific normalized value, only counting outcome ===
// 'directly_observed' — never 'unknown'/'ambiguous'/'not_visible', which
// must never be treated as if they were a confirmed value.
export function findObserved(
  observations: readonly RecruitingLeadObservation[],
  key: string,
  value?: string
): RecruitingLeadObservation | undefined {
  return observations
    .filter((o) => o.observation_key === key && o.visibility === "directly_observed")
    .filter((o) => value === undefined || o.normalized_value === value)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
}
