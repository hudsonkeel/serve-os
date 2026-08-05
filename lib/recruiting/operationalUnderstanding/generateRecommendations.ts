// Recommendations derive ONLY from Gaps/Unknowns — never directly from a
// raw observation. See
// docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md
// (Revision 2), section 6/F.
import type { DesiredStateEvaluationResult, OperationalGap, OperationalRecommendation } from "./types.ts";

// Deterministic, reviewed templates — one per known Blocking Gap
// requirement key. A requirement with no template here still produces a
// recommendation, using its own gap description verbatim, so nothing is
// ever silently dropped for lack of a template.
const BLOCKING_GAP_RECOMMENDATION_TEXT: Record<string, string> = {
  "recruiting.possible_pipeline_stage_inconsistency":
    "Review the conflicting pipeline-stage evidence and resolve before recording a hiring decision.",
  "recruiting.cross_system_stage_inconsistency":
    "Review the conflicting Apploi/Viventium evidence and resolve before recording a hiring decision.",
};

// Deterministic, per-Desired-State "what to collect next" phrase, used only
// when that stage is currently unknown/in_progress (never satisfied or
// not_applicable) and no Blocking Gap exists anywhere yet.
const EVIDENCE_GATHERING_PHRASE: Record<string, string> = {
  "recruiting.desired_state.lead_identified": "a confirmed vendor identity link or corroborating candidate name",
  "recruiting.desired_state.application_received": "direct application-existence evidence from Apploi",
  "recruiting.desired_state.candidate_evaluation_complete": "direct candidate-evaluation evidence from Apploi",
  "recruiting.desired_state.hiring_decision_confirmed": "a recorded hiring decision",
  "recruiting.desired_state.employment_record_confirmed": "direct employment-record evidence from Viventium",
  "recruiting.desired_state.employment_requirements_complete": "I-9, W-4, and direct deposit evidence from Viventium",
  "recruiting.desired_state.scheduling_ready": "scheduling-system evidence, once a collector exists",
};

function recommendationFromBlockingGap(result: DesiredStateEvaluationResult, gap: OperationalGap): OperationalRecommendation {
  return {
    desiredStateKey: result.desiredStateKey,
    requirementKey: gap.requirementKey,
    requiredEvidence: gap.requirementKey,
    observedEvidence: gap.observedValue,
    missingEvidence: gap.missingEvidence,
    explanation: gap.description,
    recommendationText: BLOCKING_GAP_RECOMMENDATION_TEXT[gap.requirementKey] ?? gap.description,
  };
}

function recommendationFromUnresolvedStage(result: DesiredStateEvaluationResult): OperationalRecommendation {
  const phrase = EVIDENCE_GATHERING_PHRASE[result.desiredStateKey] ?? "additional direct evidence";
  return {
    desiredStateKey: result.desiredStateKey,
    requirementKey: result.desiredStateKey,
    requiredEvidence: phrase,
    observedEvidence: null,
    missingEvidence: result.unknownEvidence.length > 0 ? result.unknownEvidence : [phrase],
    explanation: result.explanation,
    recommendationText: `Collect ${phrase}.`,
  };
}

// Every Blocking Gap first (in lifecycle order), then one evidence-
// gathering recommendation per currently-unresolved (unknown/in_progress)
// stage that has no Blocking Gap of its own — never for a satisfied or
// not_applicable stage. Nothing here claims a remediation of a confirmed
// failure when all that exists is an absence of evidence.
export function generateRecommendations(results: readonly DesiredStateEvaluationResult[]): OperationalRecommendation[] {
  const recommendations: OperationalRecommendation[] = [];

  for (const result of results) {
    // Conflicting Evidence gaps that are also adopted+blocking still block
    // a transition — they must produce a remediation recommendation the
    // same way a plain Blocking Gap does.
    const blockingGaps = result.gaps.filter((g) => g.kind === "blocking" || g.kind === "conflicting");
    if (blockingGaps.length > 0) {
      for (const gap of blockingGaps) recommendations.push(recommendationFromBlockingGap(result, gap));
      continue;
    }
    if (result.status === "unknown" || result.status === "in_progress") {
      recommendations.push(recommendationFromUnresolvedStage(result));
    }
  }

  return recommendations;
}

// Synthesizes the single "Next Recommended Action" line the UI surfaces.
// If any Blocking Gap exists anywhere, only the earliest one is surfaced —
// a real, confirmed problem always takes priority over evidence-gathering.
// Otherwise, the earliest 1-2 stages whose next step is actually
// EVIDENCE TO COLLECT (never a human decision to make — a decision has
// nothing to "go gather," so it's surfaced through Desired-State
// Progress/Unknowns instead, not as a collection action) are combined
// into one plain, honest "go gather more evidence" statement.
export function selectNextRecommendedAction(recommendations: readonly OperationalRecommendation[]): string | null {
  if (recommendations.length === 0) return null;

  const blockingTexts = recommendations.filter((r) => BLOCKING_GAP_RECOMMENDATION_TEXT[r.requirementKey] !== undefined);
  if (blockingTexts.length > 0) return blockingTexts[0].recommendationText;

  const evidenceToCollect = recommendations.filter((r) => /evidence/i.test(r.requiredEvidence));
  const gathering = evidenceToCollect.slice(0, 2);
  if (gathering.length === 0) return recommendations[0].recommendationText;
  if (gathering.length === 1) return gathering[0].recommendationText;
  return `Collect ${gathering.map((r) => r.requiredEvidence).join(" and ")} before determining hiring or readiness state.`;
}
