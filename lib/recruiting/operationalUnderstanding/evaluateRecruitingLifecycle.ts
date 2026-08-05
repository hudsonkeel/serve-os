// Orchestrator: runs every Desired State in gatedBy order for one lead's
// evidence bundle. Pure, no I/O.
import { RECRUITING_DESIRED_STATES } from "./desiredStates.ts";
import { evaluateDesiredState } from "./evaluateDesiredState.ts";
import type { DesiredStateEvaluationResult, DesiredStateStatus, RecruitingEvidenceBundle } from "./types.ts";

export function evaluateRecruitingLifecycle(bundle: RecruitingEvidenceBundle): DesiredStateEvaluationResult[] {
  const priorStatuses = new Map<string, DesiredStateStatus>();
  const results: DesiredStateEvaluationResult[] = [];

  for (const definition of RECRUITING_DESIRED_STATES) {
    const result = evaluateDesiredState(definition, bundle, priorStatuses);
    results.push(result);
    priorStatuses.set(definition.key, result.status);
  }

  return results;
}
