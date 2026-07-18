// Deterministic Service Opportunity mapping — see docs/design/
// SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Service Opportunity mapping."
//
// The current website family-consultation form does not yet collect a
// structured support-type selection (see the field-mapping inventory in
// that doc) — only a free-text `message`. This mapping table exists so a
// future structured field slots in without changing the engine's shape;
// today, every submission falls through to the free-text-only path below.

const SUPPORT_TYPE_TO_SERVICE_LABEL: Record<string, string> = {
  medication_reminders: "Medication Assistance",
  transportation: "Transportation",
  meal_preparation: "Meal Assistance",
  companionship: "Companionship",
  personal_care: "Personal Care",
  household_help: "Household Support",
  respite: "Respite / Family Support",
  home_care: "Home Care",
};

export interface ServiceOpportunityMappingResult {
  serviceSummary: string | null;
  matchedSupportLabels: string[];
}

// `rawSupportType` may be a single value or a comma/semicolon-separated
// list (some intake sources collect multi-select support types as one
// string) — every recognized value is mapped; unrecognized values are
// preserved verbatim rather than silently dropped, since Part 16 requires
// "do not infer services not selected or described," not "discard
// anything unfamiliar."
export function mapSupportTypeToServiceOpportunity(
  rawSupportType: string | null,
  freeTextCareNeeds: string | null
): ServiceOpportunityMappingResult {
  if (!rawSupportType) {
    return { serviceSummary: freeTextCareNeeds, matchedSupportLabels: [] };
  }

  const tokens = rawSupportType
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const labels = tokens.map((token) => {
    const normalized = token.toLowerCase().replace(/\s+/g, "_");
    return SUPPORT_TYPE_TO_SERVICE_LABEL[normalized] ?? token;
  });

  const summary = [labels.join(", "), freeTextCareNeeds].filter(Boolean).join(" — ");
  return { serviceSummary: summary || null, matchedSupportLabels: labels };
}
