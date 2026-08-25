// Reassessment comparison — the core longitudinal-record engine (Phase 5 of the AxisCare
// end-to-end scope). Compares a resident's CURRENT canonical approved facts against a NEW
// reassessment session's draft facts (pre-approval) and classifies every touched field. This is
// Serve-domain logic only — no AxisCare knowledge lives here; lib/integrations/axiscare/
// consumes this module's output, never the other way around.
//
// This does not exist anywhere else in the codebase today — detectAndRecordConflicts()
// (assessmentIntelligence.ts) only compares facts WITHIN a single session's own drafts, never
// against a prior session's approved facts. That gap is exactly what this module fills.
//
// Ten critical rules this module enforces (Phase 5 spec):
//  1. NOT DISCUSSED never clears an existing value — absence of a new draft fact for a field
//     that has an existing approved value always classifies as NOT_DISCUSSED, never CHANGED.
//  2. AI uncertainty never overwrites a confirmed existing fact — a field re-raised but only
//     with "uncertain" assertion_state(s), where a confirmed baseline exists, classifies as
//     REQUIRES_REVIEW (something was said, not confidently) with the baseline preserved as the
//     default outcome, never silently replaced.
//  3. Conflicting evidence always routes to human review — 2+ new draft facts disagreeing on
//     the same field_path within the same reassessment session classifies as CONFLICTING_FACT,
//     regardless of what the baseline said.
//  4-7. Identity/legal-authority/HIPAA/medical-decision fields require heightened review before
//     any change — IDENTITY_SENSITIVE_FIELD_PATHS below are never auto-classified as a plain
//     CHANGED_FACT even when the new evidence looks clean; they always surface as
//     REQUIRES_REVIEW when their value would change.
//  8. No AxisCare update occurs merely because AI extracted a different value — enforced
//     upstream of this module (this module only classifies; nothing here writes anywhere).
//  9. Human approval is required before the downstream update — this module's output is a
//     PROPOSAL, consumed by review UI (Phase 7), not an automatic mutation.
//  10. Only approved changed fields should be sent downstream — enforced by the caller: the
//     AxisCare candidate mapper (lib/integrations/axiscare/clientCandidateMapping.ts) must be
//     given the human-approved subset of this module's CHANGED_FACT/NEW_FACT results, never the
//     raw comparison output directly.

import type { AssertionState } from "./factTypes.ts";

export interface ExistingApprovedFactForComparison {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
}

export interface NewDraftFactForComparison {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
  reporter: string | null;
  evidence: string | null;
}

export type ReassessmentClassification =
  | "UNCHANGED"
  | "NEW_FACT"
  | "CHANGED_FACT"
  | "CONFLICTING_FACT"
  | "NOT_DISCUSSED"
  | "REQUIRES_REVIEW";

export interface ReassessmentComparisonRow {
  fieldPath: string;
  classification: ReassessmentClassification;
  currentApprovedValue: unknown;
  currentApprovedAssertionState: AssertionState | null;
  newlyExtractedFacts: NewDraftFactForComparison[];
  proposedNewValue: unknown;
  proposedNewAssertionState: AssertionState | null;
  proposedDownstreamAction: "none" | "propose_update";
  rationale: string;
}

// Fields carrying identity, legal-authority, or HIPAA/medical-decision weight — a change here
// is never treated as an ordinary CHANGED_FACT, no matter how clean the new evidence looks.
// Keep this list narrow and explicit rather than inferring "sensitivity" from domain — matches
// the same "never infer, always explicit" discipline the rest of this system already applies.
export const IDENTITY_SENSITIVE_FIELD_PATHS: ReadonlySet<string> = new Set([
  "identity.preferred_name",
  "identity.date_of_birth",
  "important_people.primary_contact_name",
  "important_people.decision_maker",
  "important_people.hipaa_disclosure_authorization",
  "important_people.medical_decision_authority",
]);

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return false;
}

/** Pure, side-effect-free comparison. Never reads or writes a database — callers own fetching
 * the existing approved facts (for this resident) and the new session's draft facts. */
export function compareReassessment(
  existingApprovedFacts: ExistingApprovedFactForComparison[],
  newDraftFacts: NewDraftFactForComparison[]
): ReassessmentComparisonRow[] {
  const existingByPath = new Map<string, ExistingApprovedFactForComparison>();
  for (const f of existingApprovedFacts) existingByPath.set(f.fieldPath, f);

  const newByPath = new Map<string, NewDraftFactForComparison[]>();
  for (const f of newDraftFacts) {
    const list = newByPath.get(f.fieldPath) ?? [];
    list.push(f);
    newByPath.set(f.fieldPath, list);
  }

  const allFieldPaths = new Set<string>([...existingByPath.keys(), ...newByPath.keys()]);
  const rows: ReassessmentComparisonRow[] = [];

  for (const fieldPath of allFieldPaths) {
    const existing = existingByPath.get(fieldPath) ?? null;
    const newFacts = newByPath.get(fieldPath) ?? [];
    const isIdentitySensitive = IDENTITY_SENSITIVE_FIELD_PATHS.has(fieldPath);

    // Rule 1: nothing new discussed for a field that HAS an existing value -> NOT_DISCUSSED,
    // baseline untouched. (A field with neither an existing value nor a new fact never enters
    // allFieldPaths in the first place, so this branch is only reached when `existing` is set.)
    if (newFacts.length === 0) {
      rows.push({
        fieldPath,
        classification: "NOT_DISCUSSED",
        currentApprovedValue: existing!.value,
        currentApprovedAssertionState: existing!.assertionState,
        newlyExtractedFacts: [],
        proposedNewValue: existing!.value,
        proposedNewAssertionState: existing!.assertionState,
        proposedDownstreamAction: "none",
        rationale: "Not raised in this reassessment. Existing approved value is preserved, never cleared.",
      });
      continue;
    }

    const confirmedNewFacts = newFacts.filter(
      (f) => f.assertionState === "confirmed_yes" || f.assertionState === "confirmed_no" || f.assertionState === "not_applicable"
    );
    const distinctConfirmedValues = new Set(confirmedNewFacts.map((f) => `${f.assertionState}::${JSON.stringify(f.value)}`));

    // Rule 3: 2+ disagreeing confirmed claims within this same reassessment session.
    if (distinctConfirmedValues.size > 1) {
      rows.push({
        fieldPath,
        classification: "CONFLICTING_FACT",
        currentApprovedValue: existing?.value ?? null,
        currentApprovedAssertionState: existing?.assertionState ?? null,
        newlyExtractedFacts: newFacts,
        proposedNewValue: existing?.value ?? null,
        proposedNewAssertionState: existing?.assertionState ?? null,
        proposedDownstreamAction: "none",
        rationale: `Reporters disagree within this reassessment (${confirmedNewFacts.length} conflicting confirmed claims). Existing value, if any, is NOT overwritten by either side — requires human resolution.`,
      });
      continue;
    }

    // Rule 2: something was raised, but nothing confirmed (only "uncertain") — never overwrite
    // a confirmed baseline with mere uncertainty.
    if (confirmedNewFacts.length === 0) {
      rows.push({
        fieldPath,
        classification: existing ? "REQUIRES_REVIEW" : "REQUIRES_REVIEW",
        currentApprovedValue: existing?.value ?? null,
        currentApprovedAssertionState: existing?.assertionState ?? null,
        newlyExtractedFacts: newFacts,
        proposedNewValue: existing?.value ?? null,
        proposedNewAssertionState: existing?.assertionState ?? null,
        proposedDownstreamAction: "none",
        rationale: existing
          ? "Raised in this reassessment but only with uncertain/hedged evidence — existing confirmed value is preserved, not overwritten by uncertainty."
          : "Raised in this reassessment but only with uncertain/hedged evidence, and there is no existing baseline — needs a human decision before becoming a fact at all.",
      });
      continue;
    }

    // Exactly one confirmed claim from here on.
    const newFact = confirmedNewFacts[0];

    if (!existing) {
      rows.push({
        fieldPath,
        classification: "NEW_FACT",
        currentApprovedValue: null,
        currentApprovedAssertionState: null,
        newlyExtractedFacts: newFacts,
        proposedNewValue: newFact.value,
        proposedNewAssertionState: newFact.assertionState,
        proposedDownstreamAction: "propose_update",
        rationale: "No prior approved fact for this field — newly captured in this reassessment.",
      });
      continue;
    }

    const unchanged = existing.assertionState === newFact.assertionState && valuesEqual(existing.value, newFact.value);

    if (unchanged) {
      rows.push({
        fieldPath,
        classification: "UNCHANGED",
        currentApprovedValue: existing.value,
        currentApprovedAssertionState: existing.assertionState,
        newlyExtractedFacts: newFacts,
        proposedNewValue: existing.value,
        proposedNewAssertionState: existing.assertionState,
        proposedDownstreamAction: "none",
        rationale: "Reconfirmed identically to the existing approved value — nothing to propose downstream.",
      });
      continue;
    }

    // A real difference exists. Identity-sensitive fields always require heightened review
    // rather than a plain CHANGED_FACT auto-classification (rules 4-7).
    rows.push({
      fieldPath,
      classification: isIdentitySensitive ? "REQUIRES_REVIEW" : "CHANGED_FACT",
      currentApprovedValue: existing.value,
      currentApprovedAssertionState: existing.assertionState,
      newlyExtractedFacts: newFacts,
      proposedNewValue: newFact.value,
      proposedNewAssertionState: newFact.assertionState,
      proposedDownstreamAction: isIdentitySensitive ? "none" : "propose_update",
      rationale: isIdentitySensitive
        ? "Identity/legal-authority-sensitive field would change — always requires explicit human review before any downstream action, regardless of evidence confidence."
        : "Differs from the existing approved value.",
    });
  }

  return rows.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath));
}
