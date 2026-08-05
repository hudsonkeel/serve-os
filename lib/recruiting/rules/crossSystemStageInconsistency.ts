import { findObserved, type RuleDefinition } from "./types.ts";

const EARLY_STAGE_LABELS = ["Requested Interview", "Application Received", "New Applicant"];

// Rule F. Fires when Apploi and Viventium hold materially different
// lifecycle evidence for the SAME Serve recruiting lead — WITHOUT assuming
// either vendor is the correct one. Both observations are already scoped
// to one recruiting_lead_id by construction, so the identity-linkage
// question (Phase 4's match ladder) is a precondition enforced upstream,
// at collection time — this rule only reasons over evidence already
// attributed to one confirmed person, it does not re-verify that
// attribution itself.
export const crossSystemStageInconsistency: RuleDefinition = {
  slug: "cross_system_stage_inconsistency",
  title: "Cross-system stage inconsistency",
  description:
    "Apploi and Viventium contain materially different lifecycle evidence for the same recruiting lead.",
  version: 1,
  logicReference: "lib/recruiting/rules/crossSystemStageInconsistency.ts@1",
  evaluate(observations) {
    const apploiStage = observations
      .filter((o) => o.observation_key === "apploi.pipeline_stage" && o.visibility === "directly_observed")
      .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];

    const viventiumRecord = findObserved(observations, "viventium.employee_record_exists", "true");

    if (!apploiStage || !apploiStage.normalized_value || !viventiumRecord) return null;
    if (!EARLY_STAGE_LABELS.includes(apploiStage.normalized_value)) return null;

    return {
      signalKey: "recruiting.cross_system_stage_inconsistency",
      explanation: `Apploi directly shows the pipeline stage "${apploiStage.normalized_value}" while Viventium directly shows an employee/onboarding record already exists for this same lead.`,
      strength: "strong",
      unresolvedAlternatives: [
        "Apploi's stage may be stale.",
        "The Viventium record may be preliminary/placeholder rather than a completed hire.",
        "Neither source may yet reflect the true current state.",
      ],
      evidenceNeededToResolve: [
        "A human-confirmed hiring decision.",
        "Reconciliation of Apploi's stage against the actual current status.",
      ],
      supportingObservationIds: [apploiStage.id, viventiumRecord.id],
    };
  },
};
