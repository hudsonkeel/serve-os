// Pure decision logic for the AxisCare -> Serve canonical bootstrap's one
// non-negotiable rule: AxisCare may only ever fill a gap, never overwrite
// a fact Serve already owns. No I/O here — the caller resolves both
// values (the current residents.<field> value and the latest AxisCare
// snapshot value) and this function decides what happens next. Mirrors
// this codebase's established split between pure decision logic (unit
// tested) and I/O orchestration (live-verified) — see
// lib/residents/auditEligibleActiveClient.ts for the same pattern.
export type CanonicalizationOutcome =
  | "apply" // Serve has no value yet; AxisCare has one -> safe to write
  | "skipped_serve_already_owns" // Serve already has a value (AxisCare agrees, or has nothing to offer) -> never touched
  | "conflict_unresolved" // Serve already has a DIFFERENT value than AxisCare -> never auto-resolved, surfaced for a human
  | "not_reviewed"; // neither side has a value -> nothing to reconcile yet

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

export function decideFieldReconciliation(
  serveValue: string | null,
  axiscareValue: string | null
): CanonicalizationOutcome {
  const serveHasValue = !isBlank(serveValue);
  const axiscareHasValue = !isBlank(axiscareValue);

  if (!serveHasValue && !axiscareHasValue) return "not_reviewed";
  if (!serveHasValue && axiscareHasValue) return "apply";
  if (serveHasValue && !axiscareHasValue) return "skipped_serve_already_owns";

  // Both have a value — compare. Exact match only; this function never
  // does fuzzy/normalized comparison (e.g. phone-format differences) —
  // that's a separate, field-specific concern the caller must handle
  // before calling this, never assumed here.
  return serveValue === axiscareValue ? "skipped_serve_already_owns" : "conflict_unresolved";
}

// Reporting-only classification — a finer-grained view of the same rule
// for reconciliation PREVIEW output (never used by the actual apply
// path, which only needs decideFieldReconciliation()'s coarser 4-way
// split; both "Serve owns it, AxisCare has nothing" and "Serve owns it,
// AxisCare agrees" behave identically at apply time — no write either
// way — but a human reviewing a preview benefits from seeing which case
// they're looking at).
export type FieldPreviewStatus =
  | "WILL_POPULATE" // Serve empty, AxisCare has a value
  | "ALREADY_AGREES" // both populated, values match
  | "SERVE_ALREADY_OWNS" // Serve populated, AxisCare has nothing to offer
  | "CONFLICT_REVIEW" // both populated, values differ
  | "AXISCARE_EMPTY"; // neither side has a value — genuinely still missing

export function classifyFieldForPreview(serveValue: string | null, axiscareValue: string | null): FieldPreviewStatus {
  const serveHasValue = !isBlank(serveValue);
  const axiscareHasValue = !isBlank(axiscareValue);

  if (!axiscareHasValue) return serveHasValue ? "SERVE_ALREADY_OWNS" : "AXISCARE_EMPTY";
  if (!serveHasValue) return "WILL_POPULATE";
  return serveValue === axiscareValue ? "ALREADY_AGREES" : "CONFLICT_REVIEW";
}
