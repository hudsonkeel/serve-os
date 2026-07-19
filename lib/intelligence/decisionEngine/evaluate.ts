import "server-only";
import { ensureRuleVersion, recordDecision, findSettledRecommendation } from "../../data/decisionEngine.ts";
import { emitEvent } from "../../notifications/index.ts";
import { DECISION_TYPE_REGISTRY } from "./registry.ts";
import type { DecisionType } from "./registry.ts";

// The shared Decision Intelligence service. Plain async functions — NOT
// "use server" — so the seed script and live-verification script can call
// them directly with no faked authenticated request context. The Server
// Action layer (lib/actions/decisionEngine.ts) is a thin, auth-only
// wrapper around exactly these two functions; it contains no decision
// logic these functions don't already have.

export interface EvaluateDecisionOptions {
  // Defaults to true. The seed script passes false so fictional demo cases
  // never trigger a real SERVE_NOTIFY_* email.
  readonly notify?: boolean;
  readonly supersedesRecommendationId?: string | null;
  readonly force?: boolean;
}

export interface EvaluateDecisionResult {
  readonly recommendationId?: string;
  readonly error?: string;
}

export async function evaluateDecision<TInput>(
  decisionType: DecisionType,
  input: TInput,
  options: EvaluateDecisionOptions = {},
): Promise<EvaluateDecisionResult> {
  const handler = DECISION_TYPE_REGISTRY[decisionType] as (input: TInput) => ReturnType<(typeof DECISION_TYPE_REGISTRY)[DecisionType]>;
  const spec = handler(input);

  const ruleVersionId = await ensureRuleVersion({
    domain: spec.ruleVersion.domain,
    ruleSlug: spec.ruleVersion.ruleSlug,
    ruleTitle: spec.ruleVersion.ruleTitle,
    ruleDescription: spec.ruleVersion.ruleDescription,
    version: spec.ruleVersion.version,
    triggerType: spec.ruleVersion.triggerType,
    parameters: spec.ruleVersion.parameters,
    logicReference: spec.ruleVersion.logicReference,
    policyReferences: spec.ruleVersion.policyReferences,
    authorityReferences: spec.ruleVersion.authorityReferences,
  });

  if (!ruleVersionId) {
    return { error: "Failed to resolve the rule version for this decision type." };
  }

  const supersedesRecommendationId = options.supersedesRecommendationId ?? null;

  const result = await recordDecision({
    subjectType: spec.subjectType,
    subjectId: spec.subjectId,
    subjectCanonicalTable: spec.subjectCanonicalTable,
    subjectCanonicalId: spec.subjectCanonicalId,
    domain: spec.ruleVersion.domain,
    factType: spec.factType,
    factOccurredAt: spec.factOccurredAt,
    factPayload: spec.factPayload,
    factProvenanceSourceSystem: spec.factProvenanceSourceSystem,
    factProvenanceSourceRecordId: spec.factProvenanceSourceRecordId,
    factProvenanceConfidence: spec.factProvenanceConfidence,
    ruleVersionId,
    signalType: spec.signalType,
    signalSeverity: spec.signalSeverity,
    recommendationType: spec.recommendationType,
    recommendationTitle: spec.recommendationTitle,
    recommendationDescription: spec.recommendationDescription,
    recommendationPriority: spec.recommendationPriority,
    explanationWhatHappened: spec.explanationWhatHappened,
    explanationWhyFlagged: spec.explanationWhyFlagged,
    explanationSummary: spec.explanationSummary,
    explanationRecommendedConsideration: spec.explanationRecommendedConsideration,
    supersedesRecommendationId,
    force: options.force ?? Boolean(supersedesRecommendationId),
  });

  if (result.error || !result.recommendationId) {
    return { error: result.error ?? "Unknown error recording the decision." };
  }

  const shouldNotify = options.notify ?? true;
  if (shouldNotify && spec.notification) {
    try {
      await emitEvent({
        type: spec.notification.type,
        payload: { ...spec.notification.payload, recommendationId: result.recommendationId },
      } as Parameters<typeof emitEvent>[0]);
    } catch (err) {
      // Best-effort, non-blocking — same convention as
      // lib/actions/intakeEngine.ts's notifyIfNewRecruitingLead.
      console.error("[decisionEngine:evaluateDecision:notify:error]", err);
    }
  }

  return { recommendationId: result.recommendationId };
}

// Looks up the prior settled decision for this subject/rule-version, then
// re-evaluates with the new input, marking the new Recommendation as
// superseding the prior one. The prior row is never edited.
export async function reevaluateWithNewEvidence<TInput>(
  decisionType: DecisionType,
  input: TInput,
  options: Omit<EvaluateDecisionOptions, "supersedesRecommendationId" | "force"> = {},
): Promise<EvaluateDecisionResult> {
  const handler = DECISION_TYPE_REGISTRY[decisionType] as (input: TInput) => ReturnType<(typeof DECISION_TYPE_REGISTRY)[DecisionType]>;
  const spec = handler(input);

  const ruleVersionId = await ensureRuleVersion({
    domain: spec.ruleVersion.domain,
    ruleSlug: spec.ruleVersion.ruleSlug,
    ruleTitle: spec.ruleVersion.ruleTitle,
    ruleDescription: spec.ruleVersion.ruleDescription,
    version: spec.ruleVersion.version,
    triggerType: spec.ruleVersion.triggerType,
    parameters: spec.ruleVersion.parameters,
    logicReference: spec.ruleVersion.logicReference,
    policyReferences: spec.ruleVersion.policyReferences,
    authorityReferences: spec.ruleVersion.authorityReferences,
  });
  if (!ruleVersionId) {
    return { error: "Failed to resolve the rule version for this decision type." };
  }

  const priorDecision = await findSettledRecommendation(spec.subjectType, spec.subjectId, ruleVersionId);

  return evaluateDecision(decisionType, input, {
    ...options,
    supersedesRecommendationId: priorDecision?.id ?? null,
    force: true,
  });
}
