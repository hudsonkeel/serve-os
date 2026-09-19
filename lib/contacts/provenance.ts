// Smallest provenance mechanism consistent with the Slice C.1 investigation
// (2026-09-19): reuse the repo's existing append-only + supersession convention rather
// than building a general event-sourcing framework.
//
// contact_field_provenance rows are never updated in place — asserting a new value for
// a contact field always inserts a NEW row whose supersedes_id points at the row it
// replaces. "What is the CURRENT value" is then derived, never stored redundantly, by
// the exact same rule lib/data/assessmentIntelligence.ts's getApprovedFactsForResident()
// already uses for assessment_approved_facts.supersedes_fact_id: a row is current unless
// some OTHER row's supersedes pointer names it.
//
// This lets "Susan phone = X (source: assessment, time T1)" be followed later by
// "Susan phone = Y (source: manual, time T2, supersedes T1's row)" without either
// silently overwriting the historical fact that X was once asserted, and without needing
// a full event log to answer "what is Susan's phone right now."

export interface ContactFieldProvenanceRecord {
  readonly id: string;
  readonly supersedesId: string | null;
}

/** Returns only the current (non-superseded) records — every record that some OTHER
 * record's supersedesId points at is excluded. Order-independent and pure: pass it every
 * provenance row for one contact+field, get back the one (or zero) current row(s). More
 * than one row surviving this filter means a genuine, unresolved fork (two values
 * asserted with neither ever marked as superseding the other) — this function
 * deliberately does not pick a winner in that case; it is a caller's job to decide, not
 * something to silently resolve here. */
export function currentProvenanceRecords<T extends ContactFieldProvenanceRecord>(records: readonly T[]): T[] {
  const supersededIds = new Set(
    records.map((r) => r.supersedesId).filter((id): id is string => id !== null)
  );
  return records.filter((r) => !supersededIds.has(r.id));
}
