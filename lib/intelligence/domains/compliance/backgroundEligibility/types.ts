// Shared types for the Background Eligibility decision type. No fs/yaml
// access here — kept import-safe for both server and test contexts.

// The four classifications are fixed and exhaustive per
// 01-background-eligibility-ontology.md §2 — "exactly four, no more and no
// fewer." Kept as a real runtime guard (not just a type), since
// offenseTaxonomy.ts must reject a YAML file that introduces a fifth.
export type BackgroundEligibilityClassificationId =
  | "eligible"
  | "reviewable"
  | "presumptive_disqualification"
  | "automatic_disqualification";

const KNOWN_CLASSIFICATION_IDS: readonly BackgroundEligibilityClassificationId[] = [
  "eligible",
  "reviewable",
  "presumptive_disqualification",
  "automatic_disqualification",
];

export function isBackgroundEligibilityClassificationId(
  value: string,
): value is BackgroundEligibilityClassificationId {
  return (KNOWN_CLASSIFICATION_IDS as readonly string[]).includes(value);
}
