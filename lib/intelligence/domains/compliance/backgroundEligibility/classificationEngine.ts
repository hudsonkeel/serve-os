import type { ClassificationRules } from "./classificationRules.ts";
import { loadClassificationRules } from "./classificationRules.ts";
import type { NormalizeOffenseResult } from "./normalizeOffense.ts";
import type { BackgroundEligibilityClassificationId } from "./types.ts";

// Pure — a direct implementation of 05-review-workflow.md §3 and
// 08-future-software-specification.md §4's pseudocode, reading its actual
// step order from classification-rules.yml (via the caller/default param)
// rather than re-encoding that order here. If the YAML's evaluation_order
// ever changes, this function's behavior changes with it — that is the
// point, not a bug.

export interface ClassificationMatch {
  readonly classification: BackgroundEligibilityClassificationId;
  // Null only for the Eligible fallback (01-background-eligibility-ontology.md
  // §3.4: "the deterministic fallback, not a default assumption").
  readonly matchedCategoryId: string | null;
  readonly matchedOffense: string | null;
  readonly reviewProcedure: string | null;
}

export type ClassificationResult =
  | { readonly outcome: "classified"; readonly match: ClassificationMatch }
  | { readonly outcome: "escalate_normalization_failure"; readonly unrecognizedOffenses: readonly string[] };

export function classifyBackgroundEligibility(
  findings: readonly NormalizeOffenseResult[],
  rules: ClassificationRules = loadClassificationRules(),
): ClassificationResult {
  // classification-rules.yml's on_normalization_failure: never a silent
  // default when a reported offense can't be mapped to the taxonomy.
  const unrecognized = findings.filter((f) => !f.recognized).map((f) => f.rawText);
  if (unrecognized.length > 0) {
    return { outcome: "escalate_normalization_failure", unrecognizedOffenses: unrecognized };
  }

  const normalized = findings
    .filter((f): f is Extract<NormalizeOffenseResult, { recognized: true }> => f.recognized)
    .map((f) => f.normalized);

  for (const step of rules.evaluationOrder) {
    if (step.action === "match") {
      const match = normalized.find((n) => n.classification === step.againstCategoryClassification);
      if (match) {
        return {
          outcome: "classified",
          match: {
            classification: step.onMatch.result,
            matchedCategoryId: match.categoryId,
            matchedOffense: match.rawText,
            reviewProcedure: step.onMatch.reviewProcedure,
          },
        };
      }
    } else if (step.action === "fallback") {
      return {
        outcome: "classified",
        match: {
          classification: step.result,
          matchedCategoryId: null,
          matchedOffense: null,
          reviewProcedure: step.reviewProcedure,
        },
      };
    }
  }

  // Unreachable if the YAML is well-formed — classificationRules.ts already
  // requires a fallback step to exist. Defensive only.
  throw new Error(
    "[classificationEngine] evaluation_order produced no result — classification-rules.yml is malformed.",
  );
}
