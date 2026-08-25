// Approved-fact -> AxisCare ADL mapping (Phase 10). DRY-RUN / PREVIEW ONLY — see
// clientCandidateMapping.ts's header for standing caveats. Maps Serve daily_life/care-task
// fields to REAL, live-fetched AxisCare ADL catalog entries (getAllConfiguredAdls() in
// adls.ts) — an `id` is only ever used if it was actually observed in a real catalog fetch,
// never invented. When no ACTIVE configured ADL matches, the field is UNMAPPED_REQUIRES_
// CONFIGURATION rather than silently skipped or matched to an inactive definition.
//
// Real reference data (captured live against the actual configured AxisCare site during this
// work — see the completion report for the full 99-entry catalog): the mapping table below was
// built by matching Serve's field labels against the real `adlKey`/`name` values, filtering to
// `active: true` only. This is intentionally a small, explicit, hand-verified table — never a
// fuzzy/heuristic match against arbitrary catalog entries.

import type { AssertionState } from "../../assessmentIntelligence/factTypes.ts";
import type { AxisCareAdlAssignBody, AxisCareAdlEventWrite } from "./clientWritePayloadTypes.ts";

export interface ConfiguredAdl {
  id: number;
  name: string;
  adlKey: string;
  active: boolean;
}

export interface ApprovedFactForAdlMapping {
  fieldPath: string;
  assertionState: AssertionState;
  value: unknown;
}

export type AdlMappingState = "READY" | "REQUIRES_REVIEW" | "UNMAPPED_REQUIRES_CONFIGURATION" | "NOT_APPLICABLE";

export interface AdlMappingResult {
  fieldPath: string;
  state: AdlMappingState;
  matchedAdls: ConfiguredAdl[]; // 0, 1 (READY), or 2+ (REQUIRES_REVIEW — ambiguous)
  candidatePayload: AxisCareAdlAssignBody | null; // only set when state === "READY"
  note: string;
}

// One or more candidate adlKeys per Serve field, in priority order. Multiple keys for the same
// field are NOT alternatives to pick between — see `combine` below: "single" means "there must
// be exactly one active match across all listed keys" (ambiguous if 2+), "all" means "assign
// every active match found" (both are genuinely relevant, e.g. errands AND transportation).
const FIELD_TO_ADL_KEYS: Record<string, { adlKeys: string[]; combine: "single" | "all" }> = {
  "daily_life.bathing": { adlKeys: ["bathing"], combine: "single" },
  "daily_life.dressing": { adlKeys: ["dressing"], combine: "single" },
  "daily_life.medication_reminders": { adlKeys: ["medication"], combine: "single" },
  "daily_life.housekeeping": { adlKeys: ["lthouse"], combine: "single" },
  "daily_life.grooming": { adlKeys: ["grooming"], combine: "single" },
  "daily_life.laundry": { adlKeys: ["laundry"], combine: "single" },
  "daily_life.meal_preparation": { adlKeys: ["mealprep"], combine: "single" },
  "daily_life.toileting": { adlKeys: ["toilet_assistance"], combine: "single" },
  // Two genuinely distinct, both-plausible ADLs exist for the same Serve field — a real
  // ambiguity, not a lookup bug. Surfaced as REQUIRES_REVIEW so a human picks (or assigns both).
  "daily_life.companionship_social": { adlKeys: ["companion", "conversation"], combine: "single" },
  // Both are relevant simultaneously — assign both, not a choice between them.
  "daily_life.transportation_errands": { adlKeys: ["errands", "transportation"], combine: "all" },
};

// Fields deliberately OUT OF SCOPE for ADL mapping — equipment presence (walker/cane/
// wheelchair) or free-text/diagnostic signals (gait_steadiness, recent_falls) don't correspond
// to an assignable AxisCare service task the way a daily-life care need does. Listed explicitly
// so a reviewer can tell "not applicable" apart from "should map but nothing configured."
const NOT_APPLICABLE_FIELD_PATHS = new Set([
  "mobility_safety.walker",
  "mobility_safety.cane",
  "mobility_safety.wheelchair",
  "mobility_safety.recent_falls",
  "mobility_safety.gait_steadiness",
  "mobility_safety.shower_equipment",
  "mobility_safety.environmental_concerns",
  "daily_life.meals_nutrition", // nutritional status signal, not itself an assignable task (meal_preparation/mealprep is the task)
  "daily_life.transfers", // no clearly-corresponding single active ADL identified this pass — flagged separately, not silently mapped
  "daily_life.continence", // same
]);

// Default assign-every-day, any-time event — the safe, minimal default for a dry-run candidate.
// A real assignment would let a reviewer adjust days/times before approval; this mapper only
// proposes the default shape.
const DEFAULT_EVENTS: AxisCareAdlEventWrite[] = (["N", "M", "T", "W", "R", "F", "S"] as const).map((recur) => ({
  require: 1,
  recur,
  when: 0,
}));

export function mapFactsToAdlCandidates(
  approvedFacts: ApprovedFactForAdlMapping[],
  configuredAdls: ConfiguredAdl[]
): AdlMappingResult[] {
  const results: AdlMappingResult[] = [];
  const confirmedYesFieldPaths = new Set(
    approvedFacts.filter((f) => f.assertionState === "confirmed_yes").map((f) => f.fieldPath)
  );

  for (const fieldPath of confirmedYesFieldPaths) {
    if (NOT_APPLICABLE_FIELD_PATHS.has(fieldPath)) {
      results.push({ fieldPath, state: "NOT_APPLICABLE", matchedAdls: [], candidatePayload: null, note: "Not a service-task field — no ADL assignment applies (equipment/diagnostic signal, not a caregiving task)." });
      continue;
    }

    const mapping = FIELD_TO_ADL_KEYS[fieldPath];
    if (!mapping) {
      // A confirmed daily_life-style need with no entry in our table at all — genuinely unknown
      // rather than silently NOT_APPLICABLE, since we haven't made a deliberate scoping decision
      // about it the way we have for the fields above.
      results.push({ fieldPath, state: "UNMAPPED_REQUIRES_CONFIGURATION", matchedAdls: [], candidatePayload: null, note: "No ADL mapping has been defined for this field yet — not yet reviewed for ADL-catalog correspondence." });
      continue;
    }

    const matches = configuredAdls.filter((adl) => adl.active && mapping.adlKeys.includes(adl.adlKey));

    if (matches.length === 0) {
      results.push({
        fieldPath,
        state: "UNMAPPED_REQUIRES_CONFIGURATION",
        matchedAdls: [],
        candidatePayload: null,
        note: `No ACTIVE configured ADL matches key(s) [${mapping.adlKeys.join(", ")}] in the supplied catalog — the agency needs to activate/configure one before this can be assigned, never invented.`,
      });
      continue;
    }

    if (mapping.combine === "single" && matches.length > 1) {
      results.push({
        fieldPath,
        state: "REQUIRES_REVIEW",
        matchedAdls: matches,
        candidatePayload: null,
        note: `${matches.length} active ADLs match this field (${matches.map((m) => m.name).join(", ")}) — genuinely ambiguous, needs a human to pick (or confirm both apply).`,
      });
      continue;
    }

    // Exactly one match (single mode), or "all" mode with 1+ matches — build a candidate per
    // matched ADL. All are READY; multiple READY rows for "all" mode is expected, not ambiguous.
    for (const adl of matches) {
      results.push({
        fieldPath,
        state: "READY",
        matchedAdls: [adl],
        candidatePayload: { id: adl.id, events: DEFAULT_EVENTS },
        note: `Matched real configured ADL "${adl.name}" (id ${adl.id}).`,
      });
    }
  }

  return results.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath));
}
