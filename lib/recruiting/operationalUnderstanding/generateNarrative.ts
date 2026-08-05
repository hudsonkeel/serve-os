// Deterministic, template-based "Current Operational Understanding"
// paragraph — no AI, no freeform generation. See
// docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md
// (Revision 2), section D.
import type { DesiredStateEvaluationResult } from "./types.ts";

function findResult(results: readonly DesiredStateEvaluationResult[], key: string) {
  return results.find((r) => r.desiredStateKey === key);
}

export function generateOperationalUnderstandingNarrative(
  results: readonly DesiredStateEvaluationResult[],
  leadName: string
): string {
  const sentences: string[] = [];

  const leadIdentified = findResult(results, "recruiting.desired_state.lead_identified");
  sentences.push(
    leadIdentified?.status === "satisfied"
      ? `${leadName} is an identified, vendor-confirmed candidate.`
      : `${leadName}'s identity is not yet fully confirmed.`
  );

  const applicationReceived = findResult(results, "recruiting.desired_state.application_received");
  if (applicationReceived?.status === "satisfied") {
    sentences.push("An application has been directly confirmed in Apploi.");
  } else if (applicationReceived && applicationReceived.status !== "not_applicable") {
    sentences.push("Whether an application has been formally received has not yet been confirmed.");
  }

  const blockingGaps = results.flatMap((r) => r.gaps.filter((g) => g.kind === "blocking" || g.kind === "conflicting"));
  for (const gap of blockingGaps) sentences.push(gap.description);

  const integrationGaps = results.flatMap((r) => r.gaps.filter((g) => g.kind === "integration"));
  for (const gap of integrationGaps) sentences.push(gap.description);

  const policyGaps = results.flatMap((r) => r.gaps.filter((g) => g.kind === "policy_dependent_consideration"));
  for (const gap of policyGaps) sentences.push(gap.description);

  const hiringDecision = findResult(results, "recruiting.desired_state.hiring_decision_confirmed");
  if (hiringDecision?.status !== "satisfied") {
    sentences.push("Current hiring readiness cannot yet be determined.");
  }

  return sentences.join(" ");
}
