// Pure decision logic for the AxisCare -> Serve canonical bootstrap's one
// non-negotiable rule: AxisCare may only ever fill a gap, never overwrite
// a fact Serve already owns. No I/O here — the caller resolves both
// values (the current residents.<field> value and the latest AxisCare
// snapshot value) and this function decides what happens next. Mirrors
// this codebase's established split between pure decision logic (unit
// tested) and I/O orchestration (live-verified) — see
// lib/residents/auditEligibleActiveClient.ts for the same pattern.
import { normalizePhone } from "./clientIdentityMatching.ts";

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

// ─── Closed-Loop UX Pass, Phase 1 — the single, shared list of residents
// columns this bootstrap ever compares/writes. Previously duplicated
// privately inside clientCanonicalApply.ts; now the one canonical source
// both that file and any UI-facing reporting function (below) import,
// so the set of fields a conflict can ever be reported on can never
// silently drift from the set actually reconciled. ────────────────────
export const BOOTSTRAP_FIELD_NAMES = [
  "date_of_birth",
  "gender",
  "date_of_admission",
  "address",
  "city",
  "state",
  "zip_code",
  "family_contact_name",
  "family_contact_relationship",
  "family_contact_phone",
  "family_contact_email",
] as const;

export type BootstrapFieldName = (typeof BOOTSTRAP_FIELD_NAMES)[number];

// Human-readable labels for the reconciliation conflict UI — "No warning
// without evidence" starts with the field itself being legible (a raw
// column name like family_contact_relationship is not evidence, it's an
// implementation detail leaking into the operator's view).
export const BOOTSTRAP_FIELD_LABELS: Record<BootstrapFieldName, string> = {
  date_of_birth: "Date of Birth",
  gender: "Gender",
  date_of_admission: "Admission Date",
  address: "Street Address",
  city: "City",
  state: "State",
  zip_code: "ZIP Code",
  family_contact_name: "Family Contact Name",
  family_contact_relationship: "Family Contact Relationship",
  family_contact_phone: "Family Contact Phone",
  family_contact_email: "Family Contact Email",
};

// Final Canonical Truth Cleanup — deterministic, comparison-ONLY
// normalization. Never used for storage, display, provenance, or the
// value actually written when an "apply" gap-fill fires — every caller
// below keeps using the raw axiscareValues[field] for that; this
// function only changes what decideFieldReconciliation()/
// classifyFieldForPreview() are FED for the equality check, never what
// they mean. decideFieldReconciliation() itself stays byte-for-byte
// unchanged (still pure exact-match) — this is a normalization layer in
// front of it, not a policy change inside it.
type FieldComparisonKind = "exact" | "phone" | "relationship_phrase";

const FIELD_COMPARISON_KIND: Record<BootstrapFieldName, FieldComparisonKind> = {
  date_of_birth: "exact",
  gender: "exact",
  date_of_admission: "exact",
  address: "exact",
  city: "exact",
  state: "exact",
  zip_code: "exact",
  // Names are deliberately NEVER broadly normalized — a partial vs. full
  // name (Michele Helsley's real conflict) must stay reviewable. Only an
  // existing, explicit, governed name-equivalence rule would justify
  // touching this, and none exists today.
  family_contact_name: "exact",
  family_contact_relationship: "relationship_phrase",
  family_contact_phone: "phone",
  family_contact_email: "exact",
};

export function normalizeBootstrapFieldForComparison(field: BootstrapFieldName, value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  switch (FIELD_COMPARISON_KIND[field]) {
    case "phone": {
      // Reuses clientIdentityMatching.ts's own normalizePhone() — the
      // SAME digits-only, leading-"1"-stripped rule already established
      // for AxisCare identity matching, not a second phone-equality rule
      // invented here. A value that doesn't reduce to a clean 10-digit
      // number is never silently equated with anything else — falls back
      // to the trimmed original, so two genuinely different malformed
      // numbers still compare as different rather than both collapsing
      // toward the same normalized shape.
      return normalizePhone(trimmed) ?? trimmed;
    }
    case "relationship_phrase":
      // Insignificant formatting only — case, whitespace, hyphenation,
      // simple punctuation. Never touches the words themselves: "Daughter"
      // vs "Friend" (or "Child" vs "Daughter") is untouched and still
      // compares as different. No fuzzy semantic equivalence.
      return trimmed
        .toLowerCase()
        // ASCII hyphen-minus plus the Unicode hyphen/dash block
        // (U+2010 hyphen .. U+2015 horizontal bar) — covers every
        // hyphen/dash variant AxisCare or Serve could plausibly send.
        .replace(/[-‐-―]/g, " ")
        .replace(/[.,]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    case "exact":
    default:
      return trimmed;
  }
}

// A per-field record of a human's explicit decision on a conflicting
// value, keyed by BootstrapFieldName on
// axiscare_client_canonical_snapshot.field_decisions (see that table's
// own migration comment for the full contract). axiscare_value_at_decision
// is what makes a decision self-expiring: it only ever suppresses the
// SAME observation it was made against, never a materially new one.
export interface FieldReviewDecision {
  decision: "keep_serve" | "use_axiscare";
  axiscare_value_at_decision: string | null;
  decided_by: string;
  decided_at: string;
}

export type FieldDecisions = Partial<Record<BootstrapFieldName, FieldReviewDecision>>;

export interface FieldConflictSummary {
  field: BootstrapFieldName;
  label: string;
  serveValue: string | null;
  axiscareValue: string | null;
  axiscareObservedAt: string;
}

// Snapshot's street_address_1/2 collapse into residents' single `address`
// text column (Serve models one address line, not AxisCare's two) —
// street_address_2 is folded in only when street_address_1 is also
// present, never surfaced alone. Shared by every caller that needs to
// compare or apply the AxisCare-observed address against Serve's single
// column (clientCanonicalApply.ts, clientCanonicalSyncOrchestrator.ts,
// and the Reconciliation conflict UI's own data loader) — previously
// three independent copies of the same three lines.
export function combinedAddress(street1: string | null, street2: string | null): string | null {
  if (!street1) return null;
  return street2 ? `${street1}, ${street2}` : street1;
}

// The single source of truth for "which fields are ACTUALLY still an
// open conflict right now" — reused by both the apply step
// (clientCanonicalApply.ts, to decide what to write into
// canonicalization_status/conflict_notes) and the Reconciliation UI's
// data loader (axiscareClientSync.ts's getUnresolvedConflictsWithResidents),
// so the two can never silently disagree about what's still unresolved.
// A field drops out of this list the moment EITHER side no longer
// disagrees, OR a human already reviewed it AND AxisCare's value hasn't
// changed since — never merely because time has passed or a sync ran.
export function computeUnresolvedFieldConflicts(
  residentValues: Partial<Record<BootstrapFieldName, string | null>>,
  axiscareValues: Partial<Record<BootstrapFieldName, string | null>>,
  fieldDecisions: FieldDecisions,
  axiscareObservedAt: string
): FieldConflictSummary[] {
  const results: FieldConflictSummary[] = [];
  for (const field of BOOTSTRAP_FIELD_NAMES) {
    const outcome = decideFieldReconciliation(
      normalizeBootstrapFieldForComparison(field, residentValues[field] ?? null),
      normalizeBootstrapFieldForComparison(field, axiscareValues[field] ?? null)
    );
    if (outcome !== "conflict_unresolved") continue;

    const decision = fieldDecisions[field];
    const reviewedAgainstCurrentValue = decision && decision.axiscare_value_at_decision === (axiscareValues[field] ?? null);
    if (reviewedAgainstCurrentValue) continue; // same observation already reviewed — stay quiet

    results.push({
      field,
      label: BOOTSTRAP_FIELD_LABELS[field],
      serveValue: residentValues[field] ?? null,
      axiscareValue: axiscareValues[field] ?? null,
      axiscareObservedAt,
    });
  }
  return results;
}
