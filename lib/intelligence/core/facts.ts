import type { IntelligenceDomain, NamespacedIdentifier, OccurrenceTimestamps, RecordId } from "./shared.ts";
import type { SubjectReference } from "./subject.ts";
import type { SourceProvenance } from "./provenance.ts";

// HISTORICAL FACT — an immutable, normalized, atomic piece of operational
// truth. See Constitution Article III: "facts are not invented," "historical
// events, once recorded, are preserved," "a correction does not erase what
// came before it."
//
// Nothing in this shape may ever hold a raw, unnormalized vendor payload
// type. `payload` must already be normalized by the relevant domain's own
// normalization layer (e.g. lib/scheduling/normalize.ts) before it becomes
// a HistoricalFact — see lib/intelligence/core/__tests__ for the repo-wide
// scan that enforces this structurally.
export interface HistoricalFact extends OccurrenceTimestamps {
  readonly id: RecordId;
  readonly domain: IntelligenceDomain;
  // e.g. "scheduling.visit_completed", "wellness.observation_recorded"
  readonly factType: NamespacedIdentifier;
  readonly subject: SubjectReference;
  // Minimal, normalized fields only — never a raw vendor blob. Keep this
  // small and specific to what a Rule actually needs to evaluate.
  readonly payload: Readonly<Record<string, unknown>>;
  readonly provenance: SourceProvenance;
  // A correction is a NEW Fact whose supersedesFactId points at the Fact it
  // corrects. The superseded Fact is never edited or deleted — it remains,
  // marked superseded by the existence of a newer Fact pointing at it.
  readonly supersedesFactId: RecordId | null;
}
