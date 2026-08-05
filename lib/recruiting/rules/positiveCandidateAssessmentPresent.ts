import { findObserved, type RuleDefinition } from "./types.ts";

// Rule B — updated per the follow-up review: candidate_rating (the star
// widget, e.g. "5 out of 5 stars") and match_indicator (a possible
// separate "Good Match" vendor label) are two distinct observations, not
// one. This rule consumes only whichever of the two is actually observed
// and phrases its explanation to match precisely — it never says "Good
// Match observed" when only a numeric rating was seen, and never implies
// either one means an interview was completed.
export const positiveCandidateAssessmentPresent: RuleDefinition = {
  slug: "positive_candidate_assessment_present",
  title: "Positive candidate assessment present",
  description:
    "A directly observed positive rating and/or vendor match label exists for this candidate.",
  version: 2,
  logicReference: "lib/recruiting/rules/positiveCandidateAssessmentPresent.ts@2",
  evaluate(observations) {
    const rating = findObserved(observations, "apploi.candidate_rating");
    const matchIndicator = findObserved(observations, "apploi.match_indicator");

    if (!rating && !matchIndicator) return null;

    const supporting = [rating, matchIndicator].filter((o): o is NonNullable<typeof o> => Boolean(o));

    let explanation: string;
    if (matchIndicator && rating) {
      explanation = `A vendor rating (${rating.normalized_value}) and a separate vendor label ("${matchIndicator.normalized_value}") are both directly observed. Their relationship to each other is not assumed.`;
    } else if (matchIndicator) {
      explanation = `A positive vendor label ("${matchIndicator.normalized_value}") is directly observed on this candidate's record.`;
    } else {
      // Only the numeric rating was observed — must never be reported as
      // "Good Match observed," per the explicit review decision. Avoids
      // naming any specific vendor label here at all, precisely so this
      // sentence can never be mistaken for asserting one was seen.
      explanation = `Positive rating evidence is directly observed (${rating!.normalized_value}). No separate vendor assessment label has been confirmed.`;
    }

    return {
      signalKey: "recruiting.positive_candidate_assessment_present",
      explanation,
      strength: "strong",
      unresolvedAlternatives: [
        "Who set this rating/label and when is unknown.",
        "Whether it followed a completed interview is unknown — must never be combined with interview activity to infer that an interview was completed.",
        "Whether candidate_rating and match_indicator represent the same underlying vendor concept is unconfirmed.",
      ],
      evidenceNeededToResolve: [
        "Verified vendor documentation of what triggers this rating/label, or a timestamped audit-trail entry showing what produced it.",
        "Confirmation of whether candidate_rating and match_indicator are related, distinct, or mutually exclusive concepts in Apploi.",
      ],
      supportingObservationIds: supporting.map((o) => o.id),
    };
  },
};
