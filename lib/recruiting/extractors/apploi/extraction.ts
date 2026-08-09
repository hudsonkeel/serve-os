import type { Locator, Page } from "playwright";
import type {
  CollectionMethod,
  ExtractionConfidence,
  MatchMethod,
  RawObservation,
} from "../../../collectors/types.ts";

// Generic, vendor-agnostic-in-mechanism extraction helper — the framework
// Phase 3 of docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md
// requires, built without fabricating any real Apploi selector. Every
// FieldSelectorConfig this function is given is supplied by the caller —
// nothing in this file hardcodes a guess about Apploi's actual markup.
// Real selector strategies are populated only after the supervised DOM
// reconnaissance run (scripts/collectors/apploiDomReconnaissance.ts)
// produces real data.
//
// Bounded source text only (≤300 chars) — never an unbounded page/thread
// dump, per the minimization principle.
const MAX_RAW_LABEL_LENGTH = 300;

export interface SelectorStrategy {
  readonly matchMethod: MatchMethod;
  readonly confidence: ExtractionConfidence;
  // Returns a Locator scoped within `scope`, or null if this strategy
  // isn't applicable to attempt (e.g. no known data-testid convention).
  locate(scope: Page | Locator): Locator;
}

export interface FieldSelectorConfig {
  readonly observationKey: string;
  // Human-readable landmark, e.g. "candidate row > pipeline stage badge" —
  // never a raw selector string, per the audit-metadata convention.
  readonly sourceLocation: string;
  // Tried in order, most to least resilient. See
  // docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md §3.
  readonly strategies: readonly SelectorStrategy[];
}

function notVisible(config: FieldSelectorConfig, extractorVersion: string, observedAt: string, collectionMethod: CollectionMethod): RawObservation {
  return {
    observationKey: config.observationKey,
    outcome: "not_visible",
    rawLabel: null,
    normalizedValue: null,
    sourceLocation: config.sourceLocation,
    extractorVersion,
    extractionConfidence: null,
    matchMethod: null,
    failureReason: "selector_not_found",
    sensitivity: "standard",
    collectionMethod,
    observedAt,
  };
}

// Extracts one field using the first selector strategy that finds anything
// at all. Never throws — every failure mode maps to a well-defined
// ObservationOutcome, never a thrown exception that would abort the whole
// collection run over one field.
export async function extractField(
  scope: Page | Locator,
  config: FieldSelectorConfig,
  extractorVersion: string,
  observedAt: string = new Date().toISOString(),
  collectionMethod: CollectionMethod = "automatic_dom"
): Promise<RawObservation> {
  for (const strategy of config.strategies) {
    let locator: Locator;
    let count: number;
    try {
      locator = strategy.locate(scope);
      count = await locator.count();
    } catch {
      continue; // this strategy itself failed to even query — try the next
    }

    if (count === 0) continue; // nothing found by this strategy — try the next

    if (count > 1) {
      return {
        observationKey: config.observationKey,
        outcome: "ambiguous",
        rawLabel: null,
        normalizedValue: null,
        sourceLocation: config.sourceLocation,
        extractorVersion,
        extractionConfidence: null,
        matchMethod: strategy.matchMethod,
        failureReason: `multiple_matches (${count})`,
        sensitivity: "standard",
        collectionMethod,
        observedAt,
      };
    }

    let text: string | null;
    try {
      text = await locator.textContent();
    } catch {
      text = null;
    }

    if (text === null || text.trim().length === 0) {
      return {
        observationKey: config.observationKey,
        outcome: "unknown",
        rawLabel: null,
        normalizedValue: null,
        sourceLocation: config.sourceLocation,
        extractorVersion,
        extractionConfidence: null,
        matchMethod: strategy.matchMethod,
        failureReason: "element_found_but_empty_or_unreadable",
        sensitivity: "standard",
        collectionMethod,
        observedAt,
      };
    }

    const bounded = text.trim().slice(0, MAX_RAW_LABEL_LENGTH);
    return {
      observationKey: config.observationKey,
      outcome: "observed",
      rawLabel: bounded,
      normalizedValue: bounded,
      sourceLocation: config.sourceLocation,
      extractorVersion,
      extractionConfidence: strategy.confidence,
      matchMethod: strategy.matchMethod,
      failureReason: null,
      sensitivity: "standard",
      collectionMethod,
      observedAt,
    };
  }

  return notVisible(config, extractorVersion, observedAt, collectionMethod);
}
