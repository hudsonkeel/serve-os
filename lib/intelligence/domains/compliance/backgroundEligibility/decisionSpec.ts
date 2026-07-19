import { classifyBackgroundEligibility } from "./classificationEngine.ts";
import type { ClassificationResult } from "./classificationEngine.ts";
import { normalizeOffenses } from "./normalizeOffense.ts";
import { mapToOperationalOutcome } from "./operationalOutcome.ts";
import type { OperationalOutcome, ReviewStatus } from "./operationalOutcome.ts";
import type { EvidenceRetrievalMetadata } from "./sourceCapability.ts";
import type { DecisionRecordSpec } from "../../../decisionEngine/types.ts";

// The registered Background Eligibility decision type — the ONE thing in
// this file that is Background-Eligibility-specific. Everything it
// produces is reduced to the generic DecisionRecordSpec shape the shared
// decision service (lib/intelligence/decisionEngine/evaluate.ts) consumes;
// nothing downstream of this function needs to know what a background
// check is.

export const BACKGROUND_ELIGIBILITY_DOMAIN = "compliance";
const RULE_SLUG = "background_eligibility_classification";
const RULE_VERSION = 1;

// Only Serve's own governance documents — repo-relative path + section.
// No external legal/regulatory citation is asserted: every governance
// document this rule implements flags its offense taxonomy and
// classification boundaries "Requires Legal Review"
// (00-purpose-and-scope.md §5). See docs/architecture/decisions/
// 0002-governance-decision-vertical-slice.md.
const POLICY_REFERENCES = [
  {
    documentPath: "docs/governance/workforce/background-eligibility/01-background-eligibility-ontology.md",
    title: "Background Eligibility Ontology",
    sectionId: "§2",
    sectionTitle: "The Four Classifications",
  },
  {
    documentPath: "docs/governance/workforce/background-eligibility/05-review-workflow.md",
    title: "Review Workflow",
    sectionId: "§3",
    sectionTitle: "The Deterministic Evaluation Sequence",
  },
  {
    documentPath: "docs/governance/workforce/background-eligibility/06-offense-taxonomy.md",
    title: "Offense Taxonomy",
    sectionId: "§2",
    sectionTitle: "Category → Classification Mapping",
  },
] as const;

const AUTHORITY_REFERENCES: readonly unknown[] = [];

export interface BackgroundEligibilityEvaluationInput {
  readonly subjectType: "employee" | "prospect";
  readonly subjectId: string;
  readonly subjectCanonicalTable: string | null;
  readonly subjectCanonicalId: string | null;
  // False when no background investigation report has been received yet —
  // see 00-purpose-and-scope.md §2.2 / 05-review-workflow.md §2.
  readonly reportReceived: boolean;
  readonly rawOffenses: readonly string[];
  readonly reviewStatus?: ReviewStatus;
  // How this evidence was actually obtained — see sourceCapability.ts.
  // Never "live_api" in Phase 1: no adapter here calls a live API.
  readonly retrieval: EvidenceRetrievalMetadata;
}

function severityForOutcome(outcome: OperationalOutcome): "routine" | "monitor" | "important" | "urgent" {
  switch (outcome) {
    case "eligible_to_proceed":
      return "routine";
    case "decision_pending":
      return "monitor";
    case "executive_review_required":
    case "insufficient_evidence":
      return "important";
    case "cannot_proceed":
      return "urgent";
  }
}

function describeOutcome(
  outcome: OperationalOutcome,
): { title: string; description: string; recommendationType: string } {
  switch (outcome) {
    case "eligible_to_proceed":
      return {
        title: "Confirm eligible to proceed",
        description:
          "No disqualifying background findings were identified. This confirms background eligibility only — it does not by itself complete hiring, role-eligibility, or assignment-readiness requirements (01-background-eligibility-ontology.md §3.7–3.8).",
        recommendationType: "compliance.confirm_eligible_to_proceed",
      };
    case "executive_review_required":
      return {
        title: "Route to executive review",
        description:
          "Findings presumptively disqualify the applicant, subject to executive-level review before that presumption is finalized (05-review-workflow.md §5).",
        recommendationType: "compliance.route_to_executive_review",
      };
    case "cannot_proceed":
      return {
        title: "Confirm cannot proceed",
        description:
          "Findings categorically disqualify the applicant, or a prior review upheld/did not clear a disqualifying presumption. No further discretionary review is available under this framework for this finding.",
        recommendationType: "compliance.confirm_cannot_proceed",
      };
    case "insufficient_evidence":
      return {
        title: "Request missing evidence",
        description:
          "The decision cannot be completed with the evidence currently on file. See the missing-evidence guidance for what is needed and who owns resolving it.",
        recommendationType: "compliance.request_missing_evidence",
      };
    case "decision_pending":
      return {
        title: "Route to individualized review",
        description:
          "Findings require individualized review before a final classification (05-review-workflow.md §4).",
        recommendationType: "compliance.route_to_individualized_review",
      };
  }
}

function describeWhatHappened(input: BackgroundEligibilityEvaluationInput, result: ClassificationResult | null): string {
  if (!input.reportReceived) {
    return "No background investigation report has been received for this subject yet.";
  }
  if (!result) {
    return "No findings were evaluated.";
  }
  if (result.outcome === "escalate_normalization_failure") {
    return `${result.unrecognizedOffenses.length} reported finding(s) could not be matched to the offense taxonomy: ${result.unrecognizedOffenses.join(", ")}.`;
  }
  if (result.match.matchedOffense) {
    return `A finding of "${result.match.matchedOffense}" was reported.`;
  }
  return "No qualifying findings were reported.";
}

function describeWhyFlagged(result: ClassificationResult | null): string {
  if (!result) {
    return "Evaluation could not proceed — no background investigation report has been received.";
  }
  if (result.outcome === "escalate_normalization_failure") {
    return "classification-rules.yml's on_normalization_failure requirement: an unrecognized offense is never silently defaulted to a classification.";
  }
  if (result.match.matchedCategoryId) {
    return `Matched offense category "${result.match.matchedCategoryId}", classified ${result.match.classification} per the deterministic evaluation sequence.`;
  }
  return "No offense matched a disqualifying category — classified Eligible by the deterministic fallback (05-review-workflow.md §3, Step 5).";
}

export function buildBackgroundEligibilityDecisionSpec(input: BackgroundEligibilityEvaluationInput): DecisionRecordSpec {
  const findings = input.reportReceived ? normalizeOffenses(input.rawOffenses) : [];
  const classificationResult = input.reportReceived ? classifyBackgroundEligibility(findings) : null;

  const operationalOutcome: OperationalOutcome = !input.reportReceived
    ? "insufficient_evidence"
    : mapToOperationalOutcome(classificationResult as ClassificationResult, input.reviewStatus);

  const { title, description, recommendationType } = describeOutcome(operationalOutcome);
  const severity = severityForOutcome(operationalOutcome);

  const factPayload: Record<string, unknown> = {
    reportReceived: input.reportReceived,
    rawOffenses: input.rawOffenses,
    ...(classificationResult?.outcome === "classified"
      ? {
          classification: classificationResult.match.classification,
          matchedCategoryId: classificationResult.match.matchedCategoryId,
          matchedOffense: classificationResult.match.matchedOffense,
        }
      : {}),
    ...(classificationResult?.outcome === "escalate_normalization_failure"
      ? { unrecognizedOffenses: classificationResult.unrecognizedOffenses }
      : {}),
    retrieval: input.retrieval,
  };

  return {
    ruleVersion: {
      domain: BACKGROUND_ELIGIBILITY_DOMAIN,
      ruleSlug: RULE_SLUG,
      ruleTitle: "Background Eligibility Classification",
      ruleDescription:
        "Classifies a completed background investigation into exactly one of Eligible, Reviewable, Presumptive Disqualification, or Automatic Disqualification, per the offense taxonomy.",
      version: RULE_VERSION,
      triggerType: "event",
      parameters: {},
      logicReference: "lib/intelligence/domains/compliance/backgroundEligibility/classificationEngine.ts@1",
      policyReferences: POLICY_REFERENCES,
      authorityReferences: AUTHORITY_REFERENCES,
    },
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    subjectCanonicalTable: input.subjectCanonicalTable,
    subjectCanonicalId: input.subjectCanonicalId,
    factType: "compliance.background_finding_reported",
    factOccurredAt: new Date().toISOString(),
    factPayload,
    factProvenanceSourceSystem: input.retrieval.retrievalMethod === "fixture_demonstration" ? "fixture_demonstration" : "manual",
    factProvenanceSourceRecordId: input.retrieval.externalSubjectId,
    factProvenanceConfidence: input.retrieval.isAuthoritative ? "confirmed" : "inferred",
    signalType: "compliance.background_eligibility_classified",
    signalSeverity: severity,
    recommendationType,
    recommendationTitle: title,
    recommendationDescription: description,
    recommendationPriority: severity,
    explanationWhatHappened: describeWhatHappened(input, classificationResult),
    explanationWhyFlagged: describeWhyFlagged(classificationResult),
    explanationSummary: title,
    explanationRecommendedConsideration: description,
    notification:
      operationalOutcome === "executive_review_required"
        ? {
            type: "compliance.executive_review_required",
            payload: {
              subjectType: input.subjectType,
              subjectId: input.subjectId,
              decisionTitle: title,
              decisionDescription: description,
            },
          }
        : null,
  };
}
