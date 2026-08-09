// The compact, product-facing Operational Brief — Phase 4 of the approved
// "Assisted Cross-System Flight" plan. Deterministic, template-based, no
// AI. This sits ABOVE the detailed Desired-State/Gap/Evidence drill-down;
// it must give a normal office user a useful answer in seconds, not a
// architecture-facing report.
import type { DesiredStateEvaluationResult, OperationalGap } from "./types.ts";
import { generateRecommendations, selectNextRecommendedAction } from "./generateRecommendations.ts";
import type { CapabilityEvaluationResult } from "./capabilities.ts";

export interface OperationalBrief {
  readonly currentUnderstanding: string;
  readonly currentCapability: string | null;
  readonly nextAction: string | null;
  readonly whyThisMatters: readonly string[];
  readonly uncertainty: readonly string[];
}

function findResult(results: readonly DesiredStateEvaluationResult[], key: string) {
  return results.find((r) => r.desiredStateKey === key);
}

function reconciliationGap(results: readonly DesiredStateEvaluationResult[]): OperationalGap | null {
  return (
    results
      .flatMap((r) => r.gaps)
      .find((g) => g.kind === "integration" && /reconciliation issue/i.test(g.description)) ?? null
  );
}

export function generateOperationalBrief(
  results: readonly DesiredStateEvaluationResult[],
  leadName: string,
  capabilities: readonly CapabilityEvaluationResult[] = []
): OperationalBrief {
  const leadIdentified = findResult(results, "recruiting.desired_state.lead_identified");
  const applicationReceived = findResult(results, "recruiting.desired_state.application_received");
  const employmentRecord = findResult(results, "recruiting.desired_state.employment_record_confirmed");
  const hiringDecision = findResult(results, "recruiting.desired_state.hiring_decision_confirmed");

  // ─── Current Understanding — one or two plain sentences ────────────────
  const positiveFacts: string[] = [];
  const whyThisMatters: string[] = [];

  if (applicationReceived?.status === "satisfied") {
    positiveFacts.push("an active Apploi application");
    whyThisMatters.push("Apploi shows an active application for this candidate.");
  }
  if (employmentRecord?.status === "satisfied") {
    positiveFacts.push("a Viventium employee record");
    whyThisMatters.push("Viventium shows an employee/new-hire record for this candidate.");
  }

  const sentences: string[] = [];
  sentences.push(
    positiveFacts.length > 0
      ? `${leadName} has ${positiveFacts.join(" and ")}.`
      : leadIdentified?.status === "satisfied"
        ? `${leadName} is an identified candidate; no application or employment record has been directly confirmed yet.`
        : `${leadName}'s identity is not yet fully confirmed.`
  );

  const reconciliation = reconciliationGap(results);
  if (reconciliation) {
    sentences.push(reconciliation.description);
    whyThisMatters.push(reconciliation.description);
  }

  if (hiringDecision && hiringDecision.status !== "satisfied" && hiringDecision.status !== "not_applicable") {
    sentences.push("The hiring decision is not yet confirmed in Serve.");
    whyThisMatters.push("No hiring decision has been recorded in Serve.");
  }

  // ─── Next Action ─────────────────────────────────────────────────────────
  const recommendations = generateRecommendations(results);
  const engineNextAction = selectNextRecommendedAction(recommendations);

  const hiringUnresolved = hiringDecision && hiringDecision.status !== "satisfied" && hiringDecision.status !== "not_applicable";
  let nextAction: string | null;
  if (recommendations.some((r) => /unresolved.*inconsistency|conflicting/i.test(r.explanation))) {
    // A real Blocking Gap always takes priority — unchanged from the
    // engine's own recommendation, never overridden by the brief.
    nextAction = engineNextAction;
  } else if (reconciliation && hiringUnresolved) {
    nextAction = "Confirm the hiring decision and reconcile the Apploi–Viventium linkage.";
  } else if (reconciliation) {
    nextAction = "Reconcile the Apploi–Viventium linkage for this candidate.";
  } else {
    nextAction = engineNextAction;
  }

  // ─── Uncertainty — only what materially affects the NEXT decision ───────
  const materialStages = [applicationReceived, employmentRecord, hiringDecision].filter(
    (r): r is DesiredStateEvaluationResult => Boolean(r) && r!.status !== "satisfied" && r!.status !== "not_applicable"
  );
  const uncertainty = [...new Set(materialStages.flatMap((r) => r.unknownEvidence))].slice(0, 3);

  // ─── Current Capability — the single most advanced capability actually
  // granted right now, never inferred beyond what its own governing
  // Desired State supports.
  const granted = capabilities.filter((c) => c.status === "granted");
  const currentCapability =
    granted.length > 0
      ? `${leadName} currently ${granted[granted.length - 1].title.replace(/^May /, "may ")}.`
      : capabilities.length > 0
        ? `${leadName} does not yet have any workforce capability granted.`
        : null;

  return {
    currentUnderstanding: sentences.join(" "),
    currentCapability,
    nextAction,
    whyThisMatters: whyThisMatters.slice(0, 3),
    uncertainty,
  };
}
