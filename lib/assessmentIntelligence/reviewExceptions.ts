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
  factBDraftId: string | null;
  status: "open" | "resolved";
  resolvedFactId: string | null;
}

export interface ReviewException {
  kind: "uncertain" | "conflicting" | "missing_required";
  fieldPath: string;
  label: string;
  facts: DraftFactForReview[];
  /** Only meaningful for kind "conflicting": the durably resolved fact id once every conflict
   * row for this field_path has been resolved, else null. Sourced from the database — read
   * this, not client-side click state, to know whether a conflict is actually resolved. */
  resolvedFactId: string | null;
}

export interface ReviewSummary {
  exceptions: ReviewException[];
  clearFacts: DraftFactForReview[]; // confirmed_yes/confirmed_no/not_applicable with real confidence — not shown for individual sign-off
  readyForApproval: boolean;
}

export function computeReviewExceptions(
  draftFacts: DraftFactForReview[],
  conflicts: FactConflictForReview[]
): ReviewSummary {
  const exceptions: ReviewException[] = [];
  const clearFacts: DraftFactForReview[] = [];

  // Every conflict for a field_path (open OR resolved) -- a field with a real, persisted
  // conflict record keeps surfacing as a "conflicting" exception even once resolved, so the
  // review UI can show its resolution rather than having it silently vanish and its rejected
  // value fall through to auto-accepted clearFacts alongside the winning one.
  const conflictsByFieldPath = new Map<string, FactConflictForReview[]>();
  for (const conflict of conflicts) {
    const list = conflictsByFieldPath.get(conflict.fieldPath) ?? [];
    list.push(conflict);
    conflictsByFieldPath.set(conflict.fieldPath, list);
  }

  const byFieldPath = new Map<string, DraftFactForReview[]>();
  for (const fact of draftFacts) {
    const list = byFieldPath.get(fact.fieldPath) ?? [];
    list.push(fact);
    byFieldPath.set(fact.fieldPath, list);
  }

  for (const [fieldPath, facts] of byFieldPath) {
    const definition = getFieldDefinition(fieldPath);
    const label = definition?.label ?? fieldPath;

    const fieldConflicts = conflictsByFieldPath.get(fieldPath);
    if (fieldConflicts && fieldConflicts.length > 0) {
      // Only durably resolved once every conflict row for this field_path has been resolved --
      // a field with two separate open questions isn't settled until both are.
      const allResolved = fieldConflicts.every((c) => c.resolvedFactId !== null);
      exceptions.push({
        kind: "conflicting",
        fieldPath,
        label,
        facts,
        resolvedFactId: allResolved ? fieldConflicts[0].resolvedFactId : null,
      });
      continue;
    }

    const uncertainFacts = facts.filter((f) => f.assertionState === "uncertain");
    if (uncertainFacts.length > 0) {
      exceptions.push({ kind: "uncertain", fieldPath, label, facts: uncertainFacts, resolvedFactId: null });
      continue;
    }

    clearFacts.push(...facts);
  }

  const knownFieldPaths = new Set(draftFacts.map((f) => f.fieldPath));
  for (const requiredField of requiredForReviewFields()) {
    if (!knownFieldPaths.has(requiredField.fieldPath)) {
      exceptions.push({
        kind: "missing_required",
        fieldPath: requiredField.fieldPath,
        label: requiredField.label,
        facts: [],
        resolvedFactId: null,
      });
    }
  }

  const hasOpenConflicts = conflicts.some((c) => c.status === "open");

  return {
    exceptions,
    clearFacts,
    readyForApproval: !hasOpenConflicts && draftFacts.length > 0,
  };
}

export interface DistinctFactValue {
  factId: string;
  value: unknown;
}

/** For a non-boolean conflicting exception, the review UI offers "which is correct?" over the
 * distinct values actually claimed — never a fabricated Yes/No, which is meaningless for e.g.
 * two different physician names. Dedupes same-value facts (e.g. two reporters who happened to
 * agree) down to one button per genuinely distinct value, first-seen order. */
export function distinctFactValues(facts: readonly DraftFactForReview[]): DistinctFactValue[] {
  const seenValues = new Set<string>();
  const distinct: DistinctFactValue[] = [];
  for (const fact of facts) {
    const key = JSON.stringify(fact.value ?? null);
    if (seenValues.has(key)) continue;
    seenValues.add(key);
    distinct.push({ factId: fact.id, value: fact.value });
  }
  return distinct;
}

/** A conflict is an explicit data-integrity exception (two facts genuinely disagree), not a
 * mere unknown — unlike an "uncertain" exception, it is not enough to acknowledge it and move
 * on. It only counts as resolved once a specific value has actually been picked and durably
 * persisted (exception.resolvedFactId, from the database) or just was, this session, via a
 * "fact:<id>" selection. A "leave uncertain" / "neither, needs follow-up" choice is a
 * deliberate non-resolution — it must keep blocking approval, exactly like never having picked
 * anything at all. */
export function isConflictResolutionComplete(
  conflictingExceptions: readonly ReviewException[],
  resolutions: Readonly<Record<string, string | undefined>>
): boolean {
  return conflictingExceptions.every((exception) => {
    if (exception.resolvedFactId !== null) return true;
    const resolution = resolutions[exception.fieldPath];
    return typeof resolution === "string" && resolution.startsWith("fact:");
  });
}

export interface ApprovedFactInput {
  field_path: string;
  value: unknown;
  assertion_state: string;
  collection_method: string | null;
  reporter: string | null;
  evidence: string | null;
  confidence: string;
  source_draft_fact_id: string | null;
  supersedes_fact_id: string | null;
}

/** The single source of truth for "what does this review's current state actually approve" --
 * used both to build the real approval payload (handleApprove(), unchanged behavior) and to
 * drive the Assessment tab's live preview (assessmentProjection.ts), so the two can never drift
 * into showing/submitting different things. Every clear fact approves as-is; every conflicting
 * or uncertain exception approves only if the reviewer has actually picked a value -- "leave
 * uncertain"/"neither, needs follow-up" (or never having chosen anything) contributes nothing,
 * exactly like a topic never raised at all. */
export function buildApprovedFactsForReview(
  clearFacts: readonly DraftFactForReview[],
  exceptions: readonly ReviewException[],
  resolutions: Readonly<Record<string, string | undefined>>
): ApprovedFactInput[] {
  const approvedFacts: ApprovedFactInput[] = [];

  for (const fact of clearFacts) {
    approvedFacts.push({
      field_path: fact.fieldPath,
      value: fact.value,
      assertion_state: fact.assertionState,
      collection_method: fact.collectionMethod,
      reporter: fact.reporter,
      evidence: fact.evidence,
      confidence: fact.confidence,
      source_draft_fact_id: fact.id,
      supersedes_fact_id: null,
    });
  }

  const conflictingExceptions = exceptions.filter((e) => e.kind === "conflicting");
  const uncertainExceptions = exceptions.filter((e) => e.kind === "uncertain");

  for (const exception of [...uncertainExceptions, ...conflictingExceptions]) {
    const resolution = resolutions[exception.fieldPath];
    if (!resolution || resolution === "leave_uncertain") continue; // stays unknown, not silently approved

    if (resolution.startsWith("fact:")) {
      // Non-boolean conflict, resolved by picking which of the actual conflicting facts was
      // correct — approve that fact's own real value/evidence/reporter, never a fabricated one.
      const selectedFactId = resolution.slice("fact:".length);
      const selectedFact = exception.facts.find((f) => f.id === selectedFactId);
      if (!selectedFact) continue;
      approvedFacts.push({
        field_path: exception.fieldPath,
        value: selectedFact.value,
        assertion_state: selectedFact.assertionState,
        collection_method: selectedFact.collectionMethod,
        reporter: selectedFact.reporter,
        evidence: selectedFact.evidence,
        confidence: selectedFact.confidence,
        source_draft_fact_id: selectedFact.id,
        supersedes_fact_id: null,
      });
      continue;
    }

    const sourceFact = exception.facts[0];
    approvedFacts.push({
      field_path: exception.fieldPath,
      value: resolution === "confirmed_yes",
      assertion_state: resolution,
      collection_method: sourceFact?.collectionMethod ?? null,
      reporter: "reviewer",
      evidence: `Reviewer resolution during assessment approval.`,
      confidence: "high",
      source_draft_fact_id: sourceFact?.id ?? null,
      supersedes_fact_id: null,
    });
  }

  return approvedFacts;
}
