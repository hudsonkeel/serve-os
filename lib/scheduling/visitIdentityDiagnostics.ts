// Diagnostic-only heuristics for observing whether AxisCare's composite
// Visit source_record_id remains stable across a logical service
// occurrence's lifecycle (scheduled -> in_progress -> completed ->
// corrected -> removed). This module NEVER alters Historical Fact
// natural identity, merges Facts, drives supersession, or deletes
// anything — it only computes observations for a human to review. See
// docs/intelligence/SERVE_VISIT_INTELLIGENCE_LIVE_VALIDATION.md §10 for
// the evidence motivating this: every persisted source_record_id
// observed so far is a composite string, never a plain number, in one of
// two shapes — "s=<scheduleId>:d=<date>" (seen mostly on removed
// Visits) and "v=<visitId>:s=0:d=<date>" (seen on everything else) —
// raising an unconfirmed but plausible risk that a schedule-placeholder
// and a later-confirmed Visit record could represent the same logical
// service occurrence under two different source_record_id values.
//
// Why this cannot safely become the natural key yet (Phase 10): the
// fingerprint below is a coarse, best-effort heuristic, not a verified
// identity. It can produce false negatives (a legitimate schedule
// correction shifts scheduledStart, breaking the match) and false
// positives (two genuinely independent Visits for the same Client at the
// same scheduled moment — rare, but possible). Caregiver is deliberately
// excluded from the fingerprint per this module's own design note:
// caregiver assignment can change without the Visit becoming a different
// logical occurrence. Promoting this into the real natural key would risk
// silently merging two actually-different Visits — exactly the outcome
// Historical Fact immutability exists to prevent. It is surfaced as a
// candidate for human review only.

export type SourceIdShape = "schedule_placeholder" | "visit_record" | "other";

const SCHEDULE_PLACEHOLDER_SHAPE = /^s=\d+:d=\d{4}-\d{2}-\d{2}$/;
const VISIT_RECORD_SHAPE = /^v=\d+:s=\d+:d=\d{4}-\d{2}-\d{2}$/;

export function classifySourceRecordIdShape(sourceRecordId: string): SourceIdShape {
  if (SCHEDULE_PLACEHOLDER_SHAPE.test(sourceRecordId)) return "schedule_placeholder";
  if (VISIT_RECORD_SHAPE.test(sourceRecordId)) return "visit_record";
  return "other";
}

// A deliberately coarse, heuristic key — never a replacement for
// source_record_id, and never used as one. residentId + the Central
// business service date + scheduledStart together are specific enough to
// avoid false-matching a Client's other same-day Visits in the common
// case, while still tolerant of the id-shape difference this module
// exists to observe.
export function computeVisitFingerprint(
  residentId: string,
  businessServiceDate: string,
  scheduledStart: string | null
): string {
  return `${residentId}::${businessServiceDate}::${scheduledStart ?? "(no scheduled start)"}`;
}

export interface IdStabilityRecord {
  readonly sourceRecordId: string;
  readonly fingerprint: string;
}

export interface CandidateContinuityMatch {
  readonly fingerprint: string;
  readonly sourceRecordIds: readonly string[];
}

export interface IdStabilityDiagnostics {
  readonly totalFacts: number;
  readonly schedulePlaceholderCount: number;
  readonly visitRecordCount: number;
  readonly otherShapeCount: number;
  // Fingerprints matched to more than one distinct source_record_id —
  // observation only, reported for human review, never acted on
  // automatically.
  readonly candidateContinuityMatches: readonly CandidateContinuityMatch[];
  // Of the above, specifically ones where the distinct ids include both a
  // schedule_placeholder and a visit_record shape — the exact pattern
  // this module was built to watch for.
  readonly suspectedPlaceholderToVisitTransitions: number;
}

// Pure — groups by fingerprint, flags any fingerprint mapped to more than
// one distinct source_record_id. Read-only: takes a snapshot of records,
// returns a summary. No side effects, no writes, nothing to invoke that
// could merge or supersede a Fact.
export function diagnoseIdStability(records: readonly IdStabilityRecord[]): IdStabilityDiagnostics {
  const shapeCounts: Record<SourceIdShape, number> = { schedule_placeholder: 0, visit_record: 0, other: 0 };
  const byFingerprint = new Map<string, Set<string>>();

  for (const record of records) {
    shapeCounts[classifySourceRecordIdShape(record.sourceRecordId)] += 1;

    const existing = byFingerprint.get(record.fingerprint);
    if (existing) existing.add(record.sourceRecordId);
    else byFingerprint.set(record.fingerprint, new Set([record.sourceRecordId]));
  }

  const candidateContinuityMatches: CandidateContinuityMatch[] = [];
  let suspectedPlaceholderToVisitTransitions = 0;

  for (const [fingerprint, sourceIds] of byFingerprint) {
    if (sourceIds.size <= 1) continue;
    const ids = Array.from(sourceIds);
    candidateContinuityMatches.push({ fingerprint, sourceRecordIds: ids });
    const shapes = new Set(ids.map(classifySourceRecordIdShape));
    if (shapes.has("schedule_placeholder") && shapes.has("visit_record")) {
      suspectedPlaceholderToVisitTransitions += 1;
    }
  }

  return {
    totalFacts: records.length,
    schedulePlaceholderCount: shapeCounts.schedule_placeholder,
    visitRecordCount: shapeCounts.visit_record,
    otherShapeCount: shapeCounts.other,
    candidateContinuityMatches,
    suspectedPlaceholderToVisitTransitions,
  };
}
