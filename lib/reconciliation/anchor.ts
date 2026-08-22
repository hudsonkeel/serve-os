// AxisCare Reconciliation + Multi-Source Identity Ingestion phase.
//
// The single, shared convention for "source + sourceRecordId -> a specific
// Reconciliation row." Every producer (Needs Review cards today; future
// community-roster or CRM-import Needs Review items) and every consumer
// (ReconciliationRow/UnmatchedRecordsList's own element id) must go through
// this pair of functions so the id/href scheme can never diverge between
// call sites. Deliberately source-generic — never assumes "axiscare".
export function buildReconciliationAnchorId(source: string, sourceRecordId: string): string {
  return `recon-${source}-${sourceRecordId}`;
}

export function buildReconciliationAnchorHref(source: string, sourceRecordId: string): string {
  return `/reconciliation#${buildReconciliationAnchorId(source, sourceRecordId)}`;
}
