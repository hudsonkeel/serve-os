// Real Apploi candidate-dialog selector strategies — populated only from
// the confirmed dialog-scoped reconnaissance evidence for Alma Dhora
// Owolabi's record (see docs/architecture/APPLOI_DOM_MAP.md). Each field
// below is part of the dialog's persistent left panel, visible regardless
// of which tab is active, except VIVENTIUM_INTEGRATION_STATUS_FIELD, which
// requires the Integrations tab (see VIVENTIUM_INTEGRATION_STATUS_TAB).
//
// This is the initial, narrow, approved production set only — see the
// Observation Catalog for every other field, which stays provisional or
// blocked pending further reconnaissance.
import type { FieldSelectorConfig } from "./extraction.ts";
import type { RawObservation } from "../../../collectors/types.ts";

export const CANDIDATE_NAME_FIELD: FieldSelectorConfig = {
  observationKey: "apploi.candidate_name",
  sourceLocation: "candidate dialog > header h2 (excludes the Integrations tab's 'Viventium' h2)",
  strategies: [
    {
      matchMethod: "text_content",
      confidence: "medium",
      locate: (scope) => scope.locator("h2").filter({ hasNotText: "Viventium" }),
    },
  ],
};

export const POSITION_FIELD: FieldSelectorConfig = {
  observationKey: "apploi.position",
  sourceLocation: "candidate dialog > position h3 (excludes the 'Recent Experience' / 'Education' section headings)",
  strategies: [
    {
      matchMethod: "text_content",
      confidence: "medium",
      locate: (scope) =>
        scope.locator("h3").filter({ hasNotText: "Recent Experience" }).filter({ hasNotText: "Education" }),
    },
  ],
};

export const RESUME_AVAILABILITY_FIELD: FieldSelectorConfig = {
  observationKey: "apploi.resume_availability",
  sourceLocation: "candidate dialog > Resume section (sibling of the 'Resume' h4)",
  strategies: [
    {
      matchMethod: "text_content",
      confidence: "medium",
      locate: (scope) =>
        scope.locator('h4:text-is("Resume")').locator("xpath=following-sibling::div[1]").locator("p"),
    },
  ],
};

export const VIVENTIUM_INTEGRATION_STATUS_FIELD: FieldSelectorConfig = {
  observationKey: "apploi.viventium_integration_status",
  sourceLocation: "candidate dialog > Integrations tab > noIntegrationMessage",
  strategies: [
    {
      matchMethod: "data_attribute",
      confidence: "high",
      locate: (scope) => scope.getByTestId("noIntegrationMessage"),
    },
  ],
};

// The one field in this set that isn't part of the persistent left panel —
// the collector must select/verify this tab before extracting it.
export const VIVENTIUM_INTEGRATION_STATUS_TAB = "Integrations" as const;

export const DIALOG_COLLECTOR_EXTRACTOR_VERSION = "apploi.dialogCollector@1";

// Only "No resume added." has ever been directly observed for this field.
// Any other text is a real, unclassified state — never a guessed positive —
// per the approved plan's explicit scope limit.
const KNOWN_RESUME_ABSENT_TEXT = "No resume added.";

export function finalizeResumeAvailability(raw: RawObservation): RawObservation {
  if (raw.outcome !== "observed") return raw;

  if (raw.rawLabel === KNOWN_RESUME_ABSENT_TEXT) {
    return { ...raw, normalizedValue: "not_available" };
  }

  return {
    ...raw,
    outcome: "unknown",
    normalizedValue: null,
    failureReason: "unrecognized_resume_state",
  };
}

// Narrow, defensible normalization only — this observation records exactly
// what Apploi's Integrations tab displays. It must never be read as proof
// the candidate wasn't hired, that no Viventium employee record exists,
// that onboarding didn't occur, or that a transfer never happened through
// another path.
const KNOWN_NO_INTEGRATION_TEXT = "The Application has no Viventium integration records";

export function finalizeViventiumIntegrationStatus(raw: RawObservation): RawObservation {
  if (raw.outcome !== "observed") return raw;

  if (raw.rawLabel === KNOWN_NO_INTEGRATION_TEXT) {
    return { ...raw, normalizedValue: "no_integration_record_found" };
  }

  return {
    ...raw,
    outcome: "unknown",
    normalizedValue: null,
    failureReason: "unrecognized_integration_status_text",
  };
}
