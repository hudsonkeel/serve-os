import type { OffenseTaxonomy } from "./offenseTaxonomy.ts";
import { loadOffenseTaxonomy } from "./offenseTaxonomy.ts";
import type { BackgroundEligibilityClassificationId } from "./types.ts";

// Pure — no fs access itself (the taxonomy is loaded by the caller/default
// param, so this stays trivially testable with a fixture taxonomy).

export interface NormalizedOffense {
  readonly rawText: string;
  readonly categoryId: string;
  readonly classification: BackgroundEligibilityClassificationId;
}

export type NormalizeOffenseResult =
  | { readonly recognized: true; readonly normalized: NormalizedOffense }
  | { readonly recognized: false; readonly rawText: string };

// Phase 1 has no ML/LLM offense normalization (explicit non-goal) — matches
// against each category's representative offense list, case-insensitively.
// An unrecognized offense is never silently defaulted; the caller
// (classificationEngine.ts) escalates for human review instead, per
// classification-rules.yml's on_normalization_failure requirement.
export function normalizeOffense(rawText: string, taxonomy: OffenseTaxonomy = loadOffenseTaxonomy()): NormalizeOffenseResult {
  const needle = rawText.trim().toLowerCase();
  for (const category of taxonomy.categories) {
    for (const offense of category.offenses) {
      if (offense.trim().toLowerCase() === needle) {
        return {
          recognized: true,
          normalized: { rawText, categoryId: category.id, classification: category.classification },
        };
      }
    }
  }
  return { recognized: false, rawText };
}

export function normalizeOffenses(
  rawTexts: readonly string[],
  taxonomy: OffenseTaxonomy = loadOffenseTaxonomy(),
): readonly NormalizeOffenseResult[] {
  return rawTexts.map((rawText) => normalizeOffense(rawText, taxonomy));
}
