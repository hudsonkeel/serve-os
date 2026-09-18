// Maps AxisCare's raw Client Profile Triage Level description
// (axiscare_client_canonical_snapshot.triage_level_description) to Serve's
// stable TriageLevelCode. Deliberately an explicit allowlist keyed on
// exact (trimmed) description text, NOT the numeric triage_level_id and
// NOT a fuzzy/substring match.
//
// Why: a live production query (2026-08-22) confirmed this AxisCare
// account's triageLevel picklist held FIVE distinct values, not three —
//   id=4 "PRIORITY 1 — HIGH CONTINUITY NEED"
//   id=5 "PRIORITY 2 — MODERATE CONTINUITY NEED"
//   id=6 "PRIORITY 3 — LOW CONTINUITY NEED"
//   id=1 "Can get out on their own"        <- different, older picklist
//   id=2 "Need assistance or reminding"    <- different, older picklist
// ids 1/2 are still present on real client records and remain permanently
// unrecognized (a different field's legacy values, never triage levels).
//
// AxisCare has since relabeled the three real Priority values. A
// 2026-09-18 production diagnostic (the 7 residents affected by the
// triage canonical-source gap) confirmed the account now returns "Enhanced
// Support" / "Moderate Support" / "Lower Support / Independent" for the
// same three real classifications — TRIAGE_LEVEL_LABELS carries this
// current vocabulary. Both vocabularies are recognized here, permanently:
// a resident's axiscare_client_canonical_snapshot row (or historical
// person_evidence note) may still carry the pre-relabel text until its next
// sync, and that must keep resolving to the correct code rather than
// suddenly reading as unrecognized the moment the account was renamed.
// Matching by id would silently misclassify the legacy field's values (id 3
// is also unused/missing, ruling out any simple numeric-range assumption
// too); matching by exact description text against an explicit allowlist
// is what keeps every future AxisCare relabel a deliberate addition here,
// never a guess.
import { TRIAGE_LEVEL_LABELS, type TriageLevelCode } from "../../clientReadiness/triageClassification.ts";

// Reversed from TRIAGE_LEVEL_LABELS (never hand-duplicated) so the two can
// never drift apart. This reversed map is also the seam a future
// AxisCare write-back phase reuses directly in the other direction
// (TRIAGE_LEVEL_LABELS[code] already equals AxisCare's current description
// string for every recognized code) — no second lookup table needed for
// the current vocabulary.
const CURRENT_AXISCARE_DESCRIPTION_TO_LEVEL_CODE: Record<string, TriageLevelCode> = Object.fromEntries(
  (Object.entries(TRIAGE_LEVEL_LABELS) as [TriageLevelCode, string][]).map(([code, label]) => [label, code])
);

// Superseded AxisCare vocabulary — confirmed real (2026-08-22) but no
// longer what the account returns. Kept as a permanent, explicit second
// entry set (never removed on a future relabel either) so a snapshot row or
// evidence note frozen at an earlier sync is never misread as unrecognized.
const SUPERSEDED_AXISCARE_DESCRIPTION_TO_LEVEL_CODE: Record<string, TriageLevelCode> = {
  "PRIORITY 1 — HIGH CONTINUITY NEED": "P1",
  "PRIORITY 2 — MODERATE CONTINUITY NEED": "P2",
  "PRIORITY 3 — LOW CONTINUITY NEED": "P3",
};

const AXISCARE_TRIAGE_DESCRIPTION_TO_LEVEL_CODE: Record<string, TriageLevelCode> = {
  ...SUPERSEDED_AXISCARE_DESCRIPTION_TO_LEVEL_CODE,
  ...CURRENT_AXISCARE_DESCRIPTION_TO_LEVEL_CODE,
};

// Returns null both when there's no AxisCare value at all and when the
// value present isn't one of the three recognized Priority levels —
// callers that need to distinguish those two cases (e.g. to render
// "legacy/unrecognized" rather than "no AxisCare value") should check the
// raw description string themselves, not infer it from this return value.
export function mapAxisCareTriageDescriptionToCode(description: string | null): TriageLevelCode | null {
  if (!description) return null;
  return AXISCARE_TRIAGE_DESCRIPTION_TO_LEVEL_CODE[description.trim()] ?? null;
}
