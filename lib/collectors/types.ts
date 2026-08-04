// The Serve Operational Evidence Collector contract — domain-agnostic.
// See docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md and
// docs/architecture/SERVE_OPERATIONAL_INTELLIGENCE_ARCHITECTURE.md.
//
// A Collector's ONLY responsibility: observe, preserve provenance,
// normalize. It never reasons about what an observation means — that is
// the Operational Intelligence Engine's job (this domain's first instance:
// lib/recruiting/rules/*). A Collector answers "what did I directly
// observe?" — never "where is this candidate?"
//
// This module has no recruiting-specific knowledge. lib/recruiting/ is the
// first, reference implementation built against this contract — a future
// domain (Assessments, Client Care, Billing) implements the same contract
// rather than inventing its own.

// Deliberately closed to exactly these four. A Collector must never
// produce "false", "incomplete", "not_done", "rejected", or any value that
// asserts a negative operational conclusion — those are reasoning
// conclusions, not observations. An extractor that wants to record "the
// field says No" still returns 'observed' with normalizedValue = "false" —
// a real, confirmed fact about what the page displayed. The outcome
// describes whether EXTRACTION succeeded, never what the underlying value
// means operationally.
export type ObservationOutcome = "observed" | "unknown" | "ambiguous" | "not_visible";

// The four outcomes, distinguished precisely:
//   observed     — a value was read with confidence
//   not_visible  — the targeted element/selector found nothing at all
//   unknown      — something was found but could not be confidently
//                  classified or normalized (distinct from not_visible:
//                  extraction found *something*, just couldn't read it)
//   ambiguous    — multiple candidate matches existed; none was safely
//                  selectable, so none was silently picked
export const OBSERVATION_OUTCOMES: readonly ObservationOutcome[] = [
  "observed",
  "unknown",
  "ambiguous",
  "not_visible",
];

export type ExtractionConfidence = "high" | "medium" | "low";
export type MatchMethod = "data_attribute" | "aria_role" | "text_content" | "positional" | "manual";
export type Sensitivity = "standard" | "sensitive";
export type CollectionMethod = "automatic_dom" | "guided_manual";

// One directly-observed fact, exactly as a Collector produces it — before
// it becomes a persisted recruiting_lead_observations row (see
// lib/data/recruitingLeadCollector.ts's ObservationInput, which is this
// shape plus the recruiting-domain foreign keys).
export interface RawObservation {
  readonly observationKey: string;
  readonly outcome: ObservationOutcome;
  // Bounded source text only — never a full-page or full-thread dump. An
  // extractor that cannot bound its source text should not populate this
  // rather than truncate something unbounded as an afterthought.
  readonly rawLabel: string | null;
  // Populated only when outcome === "observed".
  readonly normalizedValue: string | null;
  // Human-readable landmark ("detail drawer > Interview tab"), never a raw
  // CSS selector or XPath — this is audit metadata, not implementation.
  readonly sourceLocation: string | null;
  readonly extractorVersion: string;
  readonly extractionConfidence: ExtractionConfidence | null;
  readonly matchMethod: MatchMethod | null;
  // Populated only when outcome !== "observed" — why extraction didn't
  // resolve to a value, e.g. "selector_not_found", "multiple_matches".
  readonly failureReason: string | null;
  readonly sensitivity: Sensitivity;
  readonly collectionMethod: CollectionMethod;
  readonly observedAt: string;
}

// A Collector's entire job, for a given already-confirmed subject/context:
// produce RawObservation[]. It never writes to a vendor, never decides
// what the observations mean, and never blocks on review of its own
// output (review of the *inferences* those observations later support is
// a separate, later step owned by the Operational Intelligence Engine).
export interface Collector<TContext> {
  readonly sourceSystem: string;
  collect(context: TContext): Promise<RawObservation[]>;
}
