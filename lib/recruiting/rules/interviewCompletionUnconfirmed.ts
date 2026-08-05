import { findObserved, type RuleDefinition } from "./types.ts";

// Rule D — the rule that structurally prevents "interview completed" from
// ever being asserted by inference alone. It fires precisely BECAUSE
// completion evidence is absent while activity evidence is present — a
// negative-space rule, deliberately softer in strength than a rule
// asserting a presence (Rules A/B/C). Self-contained rather than composed
// from Rule A/C's output objects, so it remains independently testable
// with its own fixtures.
export const interviewCompletionUnconfirmed: RuleDefinition = {
  slug: "interview_completion_unconfirmed",
  title: "Interview completion unconfirmed",
  description:
    "Interview-related activity exists, but no directly observed evidence of completion is available.",
  version: 1,
  logicReference: "lib/recruiting/rules/interviewCompletionUnconfirmed.ts@1",
  evaluate(observations) {
    const activityExists =
      findObserved(observations, "apploi.timeline.interview_event_present", "true") ||
      findObserved(observations, "apploi.communication.interview_related_present", "true") ||
      findObserved(observations, "apploi.interview_scheduling_evidence", "true") ||
      findObserved(observations, "apploi.interview_reschedule_evidence", "true") ||
      findObserved(observations, "apploi.candidate_response_confirming_interview", "true");

    if (!activityExists) return null;

    // If a future extractor ever produces direct completion evidence, this
    // rule must not fire — completion becomes a direct observation, not an
    // inference, and takes precedence.
    const completionEvidence = findObserved(observations, "apploi.interview_completed_evidence", "true");
    if (completionEvidence) return null;

    return {
      signalKey: "recruiting.interview_completion_unconfirmed",
      explanation:
        "Interview-related activity is directly observed, but no directly observed evidence confirms the interview was completed.",
      strength: "moderate",
      unresolvedAlternatives: [
        "The interview may have occurred without any observable record of completion.",
        "The activity observed may not have reached the interview stage at all.",
      ],
      evidenceNeededToResolve: ["A directly observed completion indicator, if Apploi exposes one for this candidate."],
      supportingObservationIds: [activityExists.id],
    };
  },
};
