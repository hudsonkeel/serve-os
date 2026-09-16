// Pure conflict-pairing decision logic, extracted from detectAndRecordConflicts()
// (lib/data/assessmentIntelligence.ts) so it can be unit tested without Supabase — mirrors the
// lib/relationships/enrollment.ts / lib/actions/clientEnrollment.ts pure-logic/I-O split.
//
// Two draft facts for the same field_path conflict when:
//   1. one is confirmed_yes and the other confirmed_no (a real yes-vs-no disagreement), or
//   2. two people both affirm (or both deny) a non-boolean field with genuinely different
//      content -- e.g. two different physician names, both "confirmed_yes". Rule 1 alone can't
//      see this: it only ever fires on opposite polarity. Boolean fields don't need this second
//      rule -- a confirmed_yes value on a boolean field is always the same (true), so
//      same-polarity facts there can never disagree in value.
// Assessment Contract / Coverage slice, 2026-09-15 — closes the "confirmed_yes vs confirmed_yes
// on a non-boolean field silently auto-accepts" gap identified in the handoff.

import { getFieldDefinition } from "./domainRegistry.ts";

export interface ConflictCandidateFact {
  readonly id: string;
  readonly field_path: string;
  readonly assertion_state: string;
  readonly value: unknown;
}

export interface ConflictPair {
  readonly fieldPath: string;
  readonly factAId: string;
  readonly factBId: string;
}

function normalizeValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function findFirstDifferingPair(
  facts: readonly ConflictCandidateFact[]
): [ConflictCandidateFact, ConflictCandidateFact] | null {
  for (let i = 1; i < facts.length; i++) {
    if (normalizeValue(facts[i].value) !== normalizeValue(facts[0].value)) {
      return [facts[0], facts[i]];
    }
  }
  return null;
}

export interface SelfFlaggedConflict {
  readonly fieldPath: string;
  readonly factId: string;
}

/** A model-self-flagged conflict (one draft fact whose own assertion_state is "conflicting",
 * with no natural second fact to pair against) still needs a durable, resolvable record — same
 * as a paired conflict, just represented as a "singleton" row (fact_a_draft_id = this fact,
 * fact_b_draft_id = null; see 20260915020000_add_assessment_fact_conflict_resolution.sql)
 * rather than a second, parallel conflict-tracking mechanism. */
export function findSelfFlaggedConflicts(facts: readonly ConflictCandidateFact[]): SelfFlaggedConflict[] {
  return facts
    .filter((f) => f.assertion_state === "conflicting")
    .map((f) => ({ fieldPath: f.field_path, factId: f.id }));
}

export function findConflictingFactPairs(facts: readonly ConflictCandidateFact[]): ConflictPair[] {
  const byFieldPath = new Map<string, ConflictCandidateFact[]>();
  for (const fact of facts) {
    const list = byFieldPath.get(fact.field_path) ?? [];
    list.push(fact);
    byFieldPath.set(fact.field_path, list);
  }

  const pairs: ConflictPair[] = [];
  for (const [fieldPath, group] of byFieldPath) {
    const confirmedYes = group.filter((f) => f.assertion_state === "confirmed_yes");
    const confirmedNo = group.filter((f) => f.assertion_state === "confirmed_no");

    if (confirmedYes.length > 0 && confirmedNo.length > 0) {
      pairs.push({ fieldPath, factAId: confirmedYes[0].id, factBId: confirmedNo[0].id });
      continue;
    }

    const definition = getFieldDefinition(fieldPath);
    if (definition && !definition.isBoolean) {
      const differing = findFirstDifferingPair(confirmedYes) ?? findFirstDifferingPair(confirmedNo);
      if (differing) {
        pairs.push({ fieldPath, factAId: differing[0].id, factBId: differing[1].id });
      }
    }
  }

  return pairs;
}
