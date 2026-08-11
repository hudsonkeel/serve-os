// Exception-oriented review computation — surfaces only what actually needs a human's
// attention (uncertain facts, conflicts, missing required fields) rather than forcing staff
// to review every correctly-extracted field individually. See docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §6.

import { requiredForReviewFields, getFieldDefinition } from "./domainRegistry.ts";
import type { AssertionState, Confidence } from "./factTypes.ts";

export interface DraftFactForReview {
  id: string;
  fieldPath: string;
  value: unknown;
  assertionState: AssertionState;
  collectionMethod: string | null;
  reporter: string | null;
  evidence: string | null;
  confidence: Confidence;
}

export interface FactConflictForReview {
  id: string;
  fieldPath: string;
  factADraftId: string;
  factBDraftId: string;
  status: "open" | "resolved";
}

export interface ReviewException {
  kind: "uncertain" | "conflicting" | "missing_required";
  fieldPath: string;
  label: string;
  facts: DraftFactForReview[];
}

export interface ReviewSummary {
  exceptions: ReviewException[];
  clearFacts: DraftFactForReview[]; // confirmed_yes/confirmed_no/not_applicable with real confidence — not shown for individual sign-off
  readyForApproval: boolean;
}

export function computeReviewExceptions(
  draftFacts: DraftFactForReview[],
  openConflicts: FactConflictForReview[]
): ReviewSummary {
  const exceptions: ReviewException[] = [];
  const clearFacts: DraftFactForReview[] = [];
  const conflictedFieldPaths = new Set(openConflicts.filter((c) => c.status === "open").map((c) => c.fieldPath));

  const byFieldPath = new Map<string, DraftFactForReview[]>();
  for (const fact of draftFacts) {
    const list = byFieldPath.get(fact.fieldPath) ?? [];
    list.push(fact);
    byFieldPath.set(fact.fieldPath, list);
  }

  for (const [fieldPath, facts] of byFieldPath) {
    const definition = getFieldDefinition(fieldPath);
    const label = definition?.label ?? fieldPath;

    if (conflictedFieldPaths.has(fieldPath)) {
      exceptions.push({ kind: "conflicting", fieldPath, label, facts });
      continue;
    }

    const uncertainFacts = facts.filter((f) => f.assertionState === "uncertain");
    if (uncertainFacts.length > 0) {
      exceptions.push({ kind: "uncertain", fieldPath, label, facts: uncertainFacts });
      continue;
    }

    clearFacts.push(...facts);
  }

  const knownFieldPaths = new Set(draftFacts.map((f) => f.fieldPath));
  for (const requiredField of requiredForReviewFields()) {
    if (!knownFieldPaths.has(requiredField.fieldPath)) {
      exceptions.push({ kind: "missing_required", fieldPath: requiredField.fieldPath, label: requiredField.label, facts: [] });
    }
  }

  const hasOpenConflicts = openConflicts.some((c) => c.status === "open");

  return {
    exceptions,
    clearFacts,
    readyForApproval: !hasOpenConflicts && draftFacts.length > 0,
  };
}
