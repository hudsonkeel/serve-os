import type { ClassificationResult } from "./classificationEngine.ts";

// Pure — maps a classification result (plus, where relevant, a documented
// human review outcome) onto the scope's five user-facing operational
// outcomes. Distinguishes the underlying background classification from
// the operational next step, per the scope's explicit instruction: a
// background classification alone never implies the full hiring/assignment
// decision is complete (01-background-eligibility-ontology.md §3.8).

export type OperationalOutcome =
  | "eligible_to_proceed"
  | "executive_review_required"
  | "cannot_proceed"
  | "insufficient_evidence"
  | "decision_pending";

// Presumptive Disqualification's executive review tier resolves to exactly
// this vocabulary — 05-review-workflow.md §5: "upholding the presumption or
// overriding it."
export type PresumptiveReviewOutcome = "pending" | "upheld" | "overridden";

// Reviewable's individualized review resolves to a documented final
// classification decision — 05-review-workflow.md §4 / 02-...-classifications.md
// §2. Named distinctly from Presumptive's vocabulary since it is not an
// "override" of anything; it is the first and only classification decision
// for that case.
export type IndividualizedReviewOutcome = "pending" | "cleared" | "not_cleared";

export interface ReviewStatus {
  readonly presumptiveReviewOutcome?: PresumptiveReviewOutcome;
  readonly individualizedReviewOutcome?: IndividualizedReviewOutcome;
}

export function mapToOperationalOutcome(result: ClassificationResult, reviewStatus?: ReviewStatus): OperationalOutcome {
  if (result.outcome === "escalate_normalization_failure") {
    return "insufficient_evidence";
  }

  switch (result.match.classification) {
    case "eligible":
      return "eligible_to_proceed";

    case "automatic_disqualification":
      // 02-...-classifications.md §4: final upon match, no review path.
      return "cannot_proceed";

    case "presumptive_disqualification": {
      const outcome = reviewStatus?.presumptiveReviewOutcome ?? "pending";
      if (outcome === "pending") return "executive_review_required";
      return outcome === "overridden" ? "eligible_to_proceed" : "cannot_proceed";
    }

    case "reviewable": {
      const outcome = reviewStatus?.individualizedReviewOutcome ?? "pending";
      if (outcome === "pending") return "decision_pending";
      return outcome === "cleared" ? "eligible_to_proceed" : "cannot_proceed";
    }
  }
}
