import type { RecordId, SubjectType } from "./shared.ts";

// The lightweight pointer every other primitive uses to say "this is about
// that" — a Historical Fact, a Signal, a Recommendation, an Action all
// carry one of these rather than duplicating subject-resolution logic.
export interface SubjectReference {
  readonly subjectType: SubjectType;
  readonly subjectId: RecordId;
}

// The Subject registry itself — identified as a missing primitive during
// the layered architecture reconciliation specifically so every other
// primitive's subjectType/subjectId pair has one real, referenceable home
// instead of an implicit convention repeated across a dozen tables.
export interface Subject {
  readonly subjectType: SubjectType;
  readonly subjectId: RecordId;
  // Pointer to the real domain record this subject represents, e.g.
  // { canonicalTable: "residents", canonicalId: "<residents.id>" }. Null
  // only if a subject is referenced before its canonical record exists
  // (should be rare and short-lived in practice).
  readonly canonicalTable: string | null;
  readonly canonicalId: string | null;
  // The one field expected to change over a Subject's lifetime — flips
  // false when the underlying domain record is archived/discharged. A
  // Subject itself is never deleted: Historical Facts, Signals, and
  // Recommendations that reference it must remain attributable forever.
  // (Phase A is types-only — an update is represented by producing a new
  // Subject value with isActive changed, not by mutating this object;
  // marked readonly like every other field here for that reason.)
  readonly isActive: boolean;
}
