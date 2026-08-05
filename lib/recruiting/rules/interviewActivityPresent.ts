import { findObserved, type RuleDefinition } from "./types.ts";

// Rule A — see docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md
// Phase 4. Fires on the presence of ANY interview-related timeline or
// communication event. Says nothing about the event's type or outcome —
// that distinction belongs to Rule C (scheduling/reschedule specifically)
// and Rule D (completion, deliberately never inferred here).
export const interviewActivityPresent: RuleDefinition = {
  slug: "interview_activity_present",
  title: "Interview activity present",
  description:
    "At least one directly observed interview-related timeline entry or communication event exists for this candidate.",
  version: 1,
  logicReference: "lib/recruiting/rules/interviewActivityPresent.ts@1",
  evaluate(observations) {
    const timelineEvent = findObserved(observations, "apploi.timeline.interview_event_present", "true");
    const communicationEvent = findObserved(observations, "apploi.communication.interview_related_present", "true");

    const supporting = [timelineEvent, communicationEvent].filter((o): o is NonNullable<typeof o> => Boolean(o));
    if (supporting.length === 0) return null;

    return {
      signalKey: "recruiting.interview_activity_present",
      explanation:
        "Directly observed evidence shows at least one interview-related timeline entry or communication for this candidate.",
      strength: "strong",
      unresolvedAlternatives: [
        "The event could be scheduling, a reschedule, or a cancellation — this signal does not distinguish which.",
        "This signal says nothing about whether an interview occurred.",
      ],
      evidenceNeededToResolve: ["The specific event type and outcome from the timeline or communication detail."],
      supportingObservationIds: supporting.map((o) => o.id),
    };
  },
};
