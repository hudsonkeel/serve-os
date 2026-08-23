// Pure comparison layer between Serve's own current triage classification
// and AxisCare's corresponding value — no I/O. The caller resolves both
// inputs (getCurrentResidentTriageClassification for Serve's side,
// axiscare_client_canonical_snapshot.triage_level_description for
// AxisCare's) and passes them in.
//
// An explicit 7-state enum, not a boolean "conflict" flag: an AxisCare
// value must always be shown even when Serve hasn't recorded anything yet
// (never leave the UI blank when there's something real to show), and a
// legacy/unrecognized AxisCare value (see triageMapping.ts) must always be
// labeled as such — never silently dropped, and never coerced into
// looking like a real P1/P2/P3 match or mismatch.
import { mapAxisCareTriageDescriptionToCode } from "../integrations/axiscare/triageMapping.ts";
import { TRIAGE_LEVEL_LABELS, type TriageLevelCode } from "./triageClassification.ts";
import type { ResidentTriageClassification } from "../data/residentTriageClassifications.ts";

export type TriageClassificationState =
  | "no_data" // neither side has a value
  | "axiscare_only_recognized" // AxisCare has P1/P2/P3, Serve hasn't recorded yet
  | "axiscare_only_unrecognized" // AxisCare has a legacy/unrecognized value, Serve hasn't recorded yet
  | "serve_only" // Serve has recorded, AxisCare has no triage value at all
  | "agree" // both exist and match
  | "disagree" // both exist (Serve + a recognized AxisCare value) and differ -- the only real conflict
  | "serve_with_unrecognized_axiscare"; // Serve has recorded; AxisCare's value is legacy/unrecognized (noted, not a conflict)

export interface TriageClassificationDetail {
  state: TriageClassificationState;
  serve: {
    code: TriageLevelCode;
    label: string;
    effectiveDate: string;
    notes: string | null;
    actor: string;
    recordedAt: string;
  } | null;
  axiscare: {
    code: TriageLevelCode | null; // null when the raw value is present but unrecognized
    rawDescription: string;
  } | null; // null only when AxisCare has no triage value at all
}

export function buildTriageClassificationDetail(input: {
  serveCurrent: ResidentTriageClassification | null;
  axiscareRawDescription: string | null;
}): TriageClassificationDetail {
  const serve = input.serveCurrent
    ? {
        code: input.serveCurrent.levelCode,
        label: TRIAGE_LEVEL_LABELS[input.serveCurrent.levelCode],
        effectiveDate: input.serveCurrent.effectiveDate,
        notes: input.serveCurrent.notes,
        actor: input.serveCurrent.actor,
        recordedAt: input.serveCurrent.createdAt,
      }
    : null;

  const axiscareRaw = input.axiscareRawDescription?.trim() || null;
  const axiscareCode = mapAxisCareTriageDescriptionToCode(axiscareRaw);
  const axiscare = axiscareRaw ? { code: axiscareCode, rawDescription: axiscareRaw } : null;

  let state: TriageClassificationState;
  if (!serve && !axiscare) {
    state = "no_data";
  } else if (!serve && axiscare) {
    state = axiscareCode ? "axiscare_only_recognized" : "axiscare_only_unrecognized";
  } else if (serve && !axiscare) {
    state = "serve_only";
  } else if (serve && axiscare && !axiscareCode) {
    state = "serve_with_unrecognized_axiscare";
  } else if (serve && axiscare && axiscareCode) {
    state = serve.code === axiscareCode ? "agree" : "disagree";
  } else {
    // Unreachable given the branches above; kept exhaustive rather than
    // asserted away, matching this codebase's "never guess" discipline.
    state = "no_data";
  }

  return { state, serve, axiscare };
}
