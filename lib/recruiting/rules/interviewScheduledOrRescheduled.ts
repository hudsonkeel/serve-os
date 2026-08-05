import { findObserved, type RuleDefinition } from "./types.ts";

// Rule C. Fires on scheduling/reschedule/confirmation evidence
// specifically — a narrower, more specific claim than Rule A's general
// "interview activity present". Still says nothing about whether the
// interview occurred.
export const interviewScheduledOrRescheduled: RuleDefinition = {
  slug: "interview_scheduled_or_rescheduled",
  title: "Interview scheduled or rescheduled",
  description:
    "A directly observed scheduled time, reschedule event, or explicit candidate confirmation of a proposed time exists.",
  version: 1,
  logicReference: "lib/recruiting/rules/interviewScheduledOrRescheduled.ts@1",
  evaluate(observations) {
    const scheduled = findObserved(observations, "apploi.interview_scheduling_evidence", "true");
    const rescheduled = findObserved(observations, "apploi.interview_reschedule_evidence", "true");
    const confirmed = findObserved(observations, "apploi.candidate_response_confirming_interview", "true");

    const supporting = [scheduled, rescheduled, confirmed].filter((o): o is NonNullable<typeof o> => Boolean(o));
    if (supporting.length === 0) return null;

    return {
      signalKey: "recruiting.interview_scheduled_or_rescheduled",
      explanation: "Directly observed scheduling, reschedule, or candidate-confirmation evidence exists for an interview.",
      strength: "strong",
      unresolvedAlternatives: ["This signal says nothing about whether the interview actually occurred."],
      evidenceNeededToResolve: ["Direct evidence of interview completion, if the vendor ever exposes one."],
      supportingObservationIds: supporting.map((o) => o.id),
    };
  },
};
