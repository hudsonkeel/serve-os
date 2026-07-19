import type { ClassificationResult } from "./classificationEngine.ts";

// Pure, computed at evaluation/render time — never persisted as its own
// structure. Content is grounded only in what the governance documents
// actually state (00-purpose-and-scope.md §2.2's precondition,
// classification-rules.yml's on_normalization_failure requirement); this
// file invents no obligation the governance module doesn't already assert.

export interface MissingEvidenceGuidance {
  readonly what: string;
  readonly why: string;
  readonly expectedSource: string;
  readonly owner: string;
  readonly howToResolve: string;
  readonly blocksDecision: boolean;
  readonly risk: "low" | "medium" | "high";
}

export interface MissingEvidenceInput {
  // False when no background investigation report has been received at
  // all yet — a distinct state from "report received, zero disqualifying
  // findings" (which classifies as Eligible, not insufficient evidence).
  // See 00-purpose-and-scope.md §2.2 / 05-review-workflow.md §2.
  readonly reportReceived: boolean;
  readonly classificationResult: ClassificationResult | null;
}

export function getMissingEvidenceGuidance(input: MissingEvidenceInput): readonly MissingEvidenceGuidance[] {
  const items: MissingEvidenceGuidance[] = [];

  if (!input.reportReceived) {
    items.push({
      what: "Background investigation report has not been received.",
      why: "This module's evaluation only begins once a completed background investigation report exists (00-purpose-and-scope.md §2.2, 05-review-workflow.md §2).",
      expectedSource: "Background Screening Provider, via Viventium or a manually confirmed report",
      owner: "Serve Leadership / Workforce Administration",
      howToResolve: "Confirm the screening order is complete and record its findings as structured evidence.",
      blocksDecision: true,
      risk: "high",
    });
  }

  if (input.classificationResult?.outcome === "escalate_normalization_failure") {
    for (const offense of input.classificationResult.unrecognizedOffenses) {
      items.push({
        what: `The reported finding "${offense}" could not be matched to a category in the offense taxonomy.`,
        why: "classification-rules.yml's on_normalization_failure requirement: an unrecognized offense must never be silently defaulted to a classification.",
        expectedSource: "Manual review against 06-offense-taxonomy.md §7's handling procedure for unlisted offenses",
        owner: "Serve Leadership / Workforce Administration",
        howToResolve: "Identify the closest-fit risk domain and category per 06-offense-taxonomy.md §7, document the reasoning, and escalate genuinely novel or ambiguous cases to executive review.",
        blocksDecision: true,
        risk: "high",
      });
    }
  }

  return items;
}
