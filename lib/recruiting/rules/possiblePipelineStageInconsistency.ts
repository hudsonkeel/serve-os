import { findObserved, type RuleDefinition } from "./types.ts";

// Rule E. Fires when the current headline pipeline stage is an early-stage
// label while other directly observed activity suggests the candidate has
// moved further along — WITHOUT asserting the stage is wrong. Framed as
// "may be stale," per the plan, never "is stale" or "pipeline incorrect".
//
// EARLY_STAGE_LABELS is a proposed parameter, not yet Hud-approved — matches
// the Engineering Standards' "Hud-approved or still proposed" discipline
// for any tunable rule parameter. This exact list is illustrative and
// should be reviewed once real Apploi stage vocabulary is confirmed via
// DOM reconnaissance.
const EARLY_STAGE_LABELS = ["Requested Interview", "Application Received", "New Applicant"];

export const possiblePipelineStageInconsistency: RuleDefinition = {
  slug: "possible_pipeline_stage_inconsistency",
  title: "Possible pipeline stage inconsistency",
  description:
    "The current headline pipeline stage is an early-stage label while other directly observed activity suggests later progress.",
  version: 1,
  logicReference: "lib/recruiting/rules/possiblePipelineStageInconsistency.ts@1",
  evaluate(observations) {
    const stageObservation = observations
      .filter((o) => o.observation_key === "apploi.pipeline_stage" && o.visibility === "directly_observed")
      .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];

    if (!stageObservation || !stageObservation.normalized_value) return null;
    if (!EARLY_STAGE_LABELS.includes(stageObservation.normalized_value)) return null;

    const laterActivity =
      findObserved(observations, "apploi.interview_reschedule_evidence", "true") ||
      findObserved(observations, "apploi.candidate_response_confirming_interview", "true") ||
      findObserved(observations, "apploi.communication.interview_related_present", "true") ||
      findObserved(observations, "apploi.good_match_indicator", "true");

    if (!laterActivity) return null;

    return {
      signalKey: "recruiting.possible_pipeline_stage_inconsistency",
      explanation: `The pipeline stage is directly observed as "${stageObservation.normalized_value}" while other directly observed activity (${laterActivity.observation_key}) suggests the candidate may have progressed further.`,
      strength: "moderate",
      unresolvedAlternatives: [
        "The stage label may be accurate and the other activity administrative or non-substantive.",
        "The stage may simply not have been updated yet, independent of any error.",
      ],
      evidenceNeededToResolve: ["A directly observed stage-last-updated timestamp, or human confirmation of the current stage."],
      supportingObservationIds: [stageObservation.id, laterActivity.id],
    };
  },
};
