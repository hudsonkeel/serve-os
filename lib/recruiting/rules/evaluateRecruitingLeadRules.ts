import { ensureRuleVersion, insertInference } from "../../data/recruitingLeadEvidence.ts";
import type { RecruitingLeadObservation } from "../../supabase/types.ts";
import { interviewActivityPresent } from "./interviewActivityPresent.ts";
import { positiveCandidateAssessmentPresent } from "./positiveCandidateAssessmentPresent.ts";
import { interviewScheduledOrRescheduled } from "./interviewScheduledOrRescheduled.ts";
import { interviewCompletionUnconfirmed } from "./interviewCompletionUnconfirmed.ts";
import { possiblePipelineStageInconsistency } from "./possiblePipelineStageInconsistency.ts";
import { crossSystemStageInconsistency } from "./crossSystemStageInconsistency.ts";
import type { RuleDefinition } from "./types.ts";

// Every recruiting-domain rule, in one place — the orchestrator's only job
// is to run each one and persist what fires. It never adds reasoning of
// its own beyond what an individual rule already produced.
const ALL_RULES: readonly RuleDefinition[] = [
  interviewActivityPresent,
  positiveCandidateAssessmentPresent,
  interviewScheduledOrRescheduled,
  interviewCompletionUnconfirmed,
  possiblePipelineStageInconsistency,
  crossSystemStageInconsistency,
];

export async function evaluateRecruitingLeadRules(
  recruitingLeadId: string,
  observations: readonly RecruitingLeadObservation[]
): Promise<{ signalsProduced: number; errors: string[] }> {
  let signalsProduced = 0;
  const errors: string[] = [];

  for (const rule of ALL_RULES) {
    const result = rule.evaluate(observations);
    if (!result) continue;

    const { ruleVersionId, error: ruleError } = await ensureRuleVersion({
      slug: rule.slug,
      title: rule.title,
      description: rule.description,
      version: rule.version,
      triggerType: "event",
      parameters: {},
      logicReference: rule.logicReference,
    });

    if (ruleError || !ruleVersionId) {
      errors.push(`${rule.slug}: ${ruleError}`);
      continue;
    }

    const { error: insertError } = await insertInference({
      recruitingLeadId,
      ruleVersionId,
      signalKey: result.signalKey,
      explanation: result.explanation,
      strength: result.strength,
      unresolvedAlternatives: result.unresolvedAlternatives,
      evidenceNeededToResolve: result.evidenceNeededToResolve,
      supportingObservationIds: result.supportingObservationIds,
    });

    if (insertError) {
      errors.push(`${rule.slug}: ${insertError}`);
      continue;
    }

    signalsProduced++;
  }

  return { signalsProduced, errors };
}
