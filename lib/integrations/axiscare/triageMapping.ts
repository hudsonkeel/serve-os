// Maps AxisCare's raw Client Profile Triage Level description
// (axiscare_client_canonical_snapshot.triage_level_description) to Serve's
// stable TriageLevelCode. Deliberately an explicit allowlist keyed on
// exact (trimmed) description text, NOT the numeric triage_level_id and
// NOT a fuzzy/substring match.
//
// Why: a live production query (2026-08-22) confirmed this AxisCare
// account's triageLevel picklist currently holds FIVE distinct values, not
// three —
//   id=4 "PRIORITY 1 — HIGH CONTINUITY NEED"
//   id=5 "PRIORITY 2 — MODERATE CONTINUITY NEED"
//   id=6 "PRIORITY 3 — LOW CONTINUITY NEED"
//   id=1 "Can get out on their own"        <- different, older picklist
//   id=2 "Need assistance or reminding"    <- different, older picklist
// ids 1/2 are still present on real client records. Matching by id would
// silently misclassify them (id 3 is also unused/missing, ruling out any
// simple numeric-range assumption); matching by exact description text
// correctly recognizes only the real Priority values and leaves the
// legacy ones — and anything else AxisCare's admin might configure in the
// future — explicitly unrecognized rather than guessed at.
import { TRIAGE_LEVEL_LABELS, type TriageLevelCode } from "../../clientReadiness/triageClassification.ts";

// Reversed from TRIAGE_LEVEL_LABELS (never hand-duplicated) so the two can
// never drift apart. This reversed map is also the seam a future
// AxisCare write-back phase reuses directly in the other direction
// (TRIAGE_LEVEL_LABELS[code] already equals AxisCare's own description
// string for every recognized code) — no second lookup table needed.
const AXISCARE_TRIAGE_DESCRIPTION_TO_LEVEL_CODE: Record<string, TriageLevelCode> = Object.fromEntries(
  (Object.entries(TRIAGE_LEVEL_LABELS) as [TriageLevelCode, string][]).map(([code, label]) => [label, code])
);

// Returns null both when there's no AxisCare value at all and when the
// value present isn't one of the three recognized Priority levels —
// callers that need to distinguish those two cases (e.g. to render
// "legacy/unrecognized" rather than "no AxisCare value") should check the
// raw description string themselves, not infer it from this return value.
export function mapAxisCareTriageDescriptionToCode(description: string | null): TriageLevelCode | null {
  if (!description) return null;
  return AXISCARE_TRIAGE_DESCRIPTION_TO_LEVEL_CODE[description.trim()] ?? null;
}
