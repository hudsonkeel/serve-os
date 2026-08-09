// Persistence for Desired State evaluations — see
// docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md. Reuses
// ensureRuleVersion() verbatim: a Desired State evaluator IS a Rule/
// RuleVersion instance, slug `desired_state.<key>`, its governance
// metadata carried in that version's own `parameters` column.
//
// Nothing here ever writes to recruiting_leads.status.
import { createServerClient } from "../supabase/server.ts";
import { ensureRuleVersion } from "./recruitingLeadEvidence.ts";
import { RECRUITING_DESIRED_STATES } from "../recruiting/operationalUnderstanding/desiredStates.ts";
import type { DesiredStateEvaluationResult } from "../recruiting/operationalUnderstanding/types.ts";
import type { RecruitingLeadDesiredStateEvaluation } from "../supabase/types.ts";

function definitionFor(desiredStateKey: string) {
  const definition = RECRUITING_DESIRED_STATES.find((d) => d.key === desiredStateKey);
  if (!definition) throw new Error(`No DesiredStateDefinition registered for key "${desiredStateKey}"`);
  return definition;
}

export interface PersistDesiredStateEvaluationsResult {
  readonly evaluationsPersisted: number;
  readonly errors: string[];
}

export async function persistDesiredStateEvaluations(
  recruitingLeadId: string,
  results: readonly DesiredStateEvaluationResult[]
): Promise<PersistDesiredStateEvaluationsResult> {
  const supabase = createServerClient();
  const errors: string[] = [];
  let evaluationsPersisted = 0;

  for (const result of results) {
    const definition = definitionFor(result.desiredStateKey);

    const { ruleVersionId, error: ruleError } = await ensureRuleVersion({
      slug: `desired_state.${result.desiredStateKey}`,
      title: definition.title,
      description: definition.purpose,
      version: result.desiredStateVersion,
      triggerType: "event",
      parameters: {
        requiredEvidence: definition.requiredEvidence,
        evidenceCombinator: definition.evidenceCombinator,
        gatedBy: definition.gatedBy,
        operationalOwner: definition.operationalOwner,
        completionCriteria: definition.completionCriteria,
      },
      logicReference: `lib/recruiting/operationalUnderstanding/evaluateDesiredState.ts@${result.desiredStateVersion}`,
    });

    if (ruleError || !ruleVersionId) {
      errors.push(`${result.desiredStateKey}: ${ruleError}`);
      continue;
    }

    const { data: evaluation, error: insertError } = await supabase
      .from("recruiting_lead_desired_state_evaluations")
      .insert({
        recruiting_lead_id: recruitingLeadId,
        desired_state_key: result.desiredStateKey,
        rule_version_id: ruleVersionId,
        status: result.status,
        gaps: result.gaps,
        unknown_evidence: result.unknownEvidence,
        explanation: result.explanation,
      })
      .select("id")
      .single();

    if (insertError || !evaluation) {
      errors.push(`${result.desiredStateKey}: ${insertError?.message}`);
      continue;
    }

    if (result.supportingObservationIds.length > 0) {
      const { error: evidenceError } = await supabase.from("recruiting_lead_desired_state_evaluation_evidence").insert(
        result.supportingObservationIds.map((observationId) => ({
          evaluation_id: evaluation.id as string,
          observation_id: observationId,
        }))
      );
      if (evidenceError) {
        errors.push(`${result.desiredStateKey}: could not link supporting evidence: ${evidenceError.message}`);
        continue;
      }
    }

    evaluationsPersisted++;
  }

  return { evaluationsPersisted, errors };
}

export interface DesiredStateEvaluationWithEvidence extends RecruitingLeadDesiredStateEvaluation {
  supportingObservationIds: string[];
}

// Returns only the MOST RECENT evaluation per desired_state_key — every
// prior evaluation stays in the table (append-only), but the UI only ever
// needs the current understanding.
export async function getLatestDesiredStateEvaluationsForLead(
  recruitingLeadId: string
): Promise<DesiredStateEvaluationWithEvidence[]> {
  const supabase = createServerClient();

  const { data: evaluations, error } = await supabase
    .from("recruiting_lead_desired_state_evaluations")
    .select("*")
    .eq("recruiting_lead_id", recruitingLeadId)
    .order("evaluated_at", { ascending: false });

  if (error) {
    console.error("[getLatestDesiredStateEvaluationsForLead]", { recruitingLeadId, message: error.message });
    return [];
  }

  const rows = (evaluations as RecruitingLeadDesiredStateEvaluation[] | null) ?? [];
  if (rows.length === 0) return [];

  const latestByKey = new Map<string, RecruitingLeadDesiredStateEvaluation>();
  for (const row of rows) {
    if (!latestByKey.has(row.desired_state_key)) latestByKey.set(row.desired_state_key, row);
  }
  const latest = [...latestByKey.values()];

  const { data: evidenceLinks } = await supabase
    .from("recruiting_lead_desired_state_evaluation_evidence")
    .select("evaluation_id, observation_id")
    .in(
      "evaluation_id",
      latest.map((r) => r.id)
    );

  return latest.map((r) => ({
    ...r,
    supportingObservationIds: (evidenceLinks ?? [])
      .filter((l) => l.evaluation_id === r.id)
      .map((l) => l.observation_id as string),
  }));
}
