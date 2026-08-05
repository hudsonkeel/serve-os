// Viventium employee field selectors — the minimum production observation
// set approved for Phase 2. Every selector here is PROVISIONAL: built
// without the real reconnaissance JSON (only a semantic field list was
// available), using conservative, hard-stop-safe strategies that fail to
// not_visible/unknown rather than ever guessing a value. Correct these
// against real DOM evidence after the first production run.
//
// Evidence minimization, applied: this file deliberately does NOT define
// selectors for employee number, active status, caregiver role, or hire
// date — none of them currently feed a Desired State, Capability, Gap, or
// Recommendation, so per the approved evidence-minimization principle they
// are not collected. Only four observations are defined:
//   - viventium.employee_record_exists  (composite, gates Employment Record Confirmed)
//   - viventium.employee_name           (identity corroboration only)
//   - viventium.i9_status               (feeds Employment Requirements Complete)
import type { FieldSelectorConfig } from "../apploi/extraction.ts";
import type { RawObservation } from "../../../collectors/types.ts";

export const VIVENTIUM_COLLECTOR_EXTRACTOR_VERSION = "viventium.employeeCollector@1";

// Identity corroboration only — mirrors apploi.candidate_name's role
// exactly. Provisional: the first h1/h2 on the page. Viventium's real
// heading structure is unknown; correct after the first real run.
export const EMPLOYEE_NAME_FIELD: FieldSelectorConfig = {
  observationKey: "viventium.employee_name",
  sourceLocation: "employee record page > primary heading (provisional — first h1/h2)",
  strategies: [
    {
      matchMethod: "text_content",
      confidence: "low",
      locate: (scope) => scope.locator("h1, h2").first(),
    },
  ],
};

// Provisional: locate a heading/label containing "I-9" and read the
// nearest following short status text. Hard-stops (not_visible) if no
// such label exists; hard-stops (ambiguous) if more than one distinct
// status-bearing element is found near an I-9 label.
export const I9_STATUS_FIELD: FieldSelectorConfig = {
  observationKey: "viventium.i9_status",
  sourceLocation: "employee record page > I-9 section (provisional — nearest text following an 'I-9' label)",
  strategies: [
    {
      matchMethod: "text_content",
      confidence: "low",
      locate: (scope) =>
        scope
          .locator("*", { hasText: /I-?9/i })
          .locator("xpath=following::*[normalize-space(text())][1]"),
    },
  ],
};

const KNOWN_I9_VALUE_NORMALIZATION: Record<string, string> = {
  "not verified": "not_verified",
  "verified": "completed",
  "complete": "completed",
  "completed": "completed",
};

export function finalizeI9Status(raw: RawObservation): RawObservation {
  if (raw.outcome !== "observed" || !raw.rawLabel) return raw;
  const normalized = KNOWN_I9_VALUE_NORMALIZATION[raw.rawLabel.trim().toLowerCase()];
  if (!normalized) {
    return { ...raw, outcome: "unknown", normalizedValue: null, failureReason: "unrecognized_i9_status_text" };
  }
  return { ...raw, normalizedValue: normalized };
}

export interface EmployeeRecordExistsContext {
  // The employee uuid already validated by parseViventiumEmployeeUrl —
  // never a division uuid or any other identifier.
  readonly employeeUuid: string | null;
  readonly originVerified: boolean;
  readonly singleRecordConfirmed: boolean;
  readonly identityConfirmed: boolean;
}

// Composite, gated observation — mirrors apploi.application_exists exactly.
// Never inferred from name/status text alone; only from the combination of
// a confirmed stable URL identifier plus every supervised safety gate
// already having passed.
export function evaluateEmployeeRecordExists(
  ctx: EmployeeRecordExistsContext,
  extractorVersion: string,
  observedAt: string
): RawObservation {
  const base = {
    observationKey: "viventium.employee_record_exists",
    rawLabel: null,
    normalizedValue: null,
    sourceLocation: "employee record page URL (stable employee identifier) + supervised confirmation gates",
    extractorVersion,
    extractionConfidence: null,
    matchMethod: null,
    sensitivity: "standard" as const,
    collectionMethod: "automatic_dom" as const,
    observedAt,
  };

  if (!ctx.originVerified) return { ...base, outcome: "not_visible", failureReason: "origin_not_verified" };
  if (!ctx.singleRecordConfirmed) return { ...base, outcome: "not_visible", failureReason: "single_record_not_confirmed" };
  if (!ctx.identityConfirmed) return { ...base, outcome: "not_visible", failureReason: "identity_not_confirmed" };
  if (!ctx.employeeUuid) return { ...base, outcome: "not_visible", failureReason: "no_stable_employee_id_in_url" };

  return {
    ...base,
    outcome: "observed",
    rawLabel: "true",
    normalizedValue: "true",
    extractionConfidence: "medium",
    matchMethod: "positional",
    failureReason: null,
  };
}
