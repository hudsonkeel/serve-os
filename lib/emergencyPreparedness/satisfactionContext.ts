// Emergency Preparedness's closed, typed vocabulary for
// person_evidence.satisfaction_context — never free-form. Every server
// action that writes EP evidence validates against this list and rejects
// anything else before the insert; the deterministic classifier
// (readiness.ts's classifyEmergencyPreparednessEvidence) only ever reads
// back values this same code wrote, so it never depends on arbitrary
// user-entered text. See
// supabase/migrations/20260902070000_add_agencies_and_widen_agency_subject.sql's
// header for why this is not layered onto source_system.
export const EMERGENCY_PREPAREDNESS_SATISFACTION_CONTEXTS = [
  // A cadence-gated requirement reaffirmed as still current during an
  // annual review — a fresh, independent evidence row, never a rewrite of
  // the original's dates.
  "annual_reaffirmation",
  // A cadence-gated requirement's underlying document actually changed
  // during an annual review — the new row properly supersedes the prior
  // one via supersedes_evidence_id/supersedes_document_id.
  "annual_update",
  // EP_ANNUAL_PLAN_REVIEW's own satisfying fact: the annual review itself
  // happened.
  "annual_review_completed",
  // EP_ANNUAL_RESPONSE_DRILL — the two P&P §256-named evidence types,
  // explanation-only labels (auditReadinessStatus.ts's satisfied_by_event),
  // never a different compliance outcome.
  "planned_drill",
  "actual_emergency_response",
] as const;

export type EmergencyPreparednessSatisfactionContext = (typeof EMERGENCY_PREPAREDNESS_SATISFACTION_CONTEXTS)[number];

export function isEmergencyPreparednessSatisfactionContext(
  value: string | null | undefined
): value is EmergencyPreparednessSatisfactionContext {
  return (
    value !== null &&
    value !== undefined &&
    (EMERGENCY_PREPAREDNESS_SATISFACTION_CONTEXTS as readonly string[]).includes(value)
  );
}
