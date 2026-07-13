import type { IntelligenceDomain, NamespacedIdentifier, RecordId } from "./shared.ts";
import type { SubjectReference } from "./subject.ts";
import type { HistoricalFact } from "./facts.ts";

// Shared severity vocabulary — deliberately identical to the four literal
// values lib/supabase/types.ts's WellnessNotePriority already uses
// ("routine" | "monitor" | "important" | "urgent"). Generalized here as the
// platform-wide scale rather than reinvented, per the approved architecture
// ("reusing the existing urgent|important|monitor|routine vocabulary...
// generalized to a shared SignalSeverity type"). Not imported from
// lib/supabase/types.ts for the same reason ProvenanceConfidence isn't
// imported from lib/scheduling/types.ts — see provenance.ts's module
// comment.
export type SignalSeverity = "routine" | "monitor" | "important" | "urgent";

export type SignalStatus = "active" | "resolved" | "expired";

// SIGNAL — a deterministic observation produced by evaluating Rule input
// (Historical Facts, and — for aggregation-level rules like Community
// Intelligence's — other Signals) against a specific Rule Version.
//
// A Signal is created ONLY by the Rule Engine (Phase C). Nothing else may
// construct one — see lib/intelligence/core/README.md's ownership table.
export interface Signal {
  readonly id: RecordId;
  readonly domain: IntelligenceDomain;
  // e.g. "relationship.touch_overdue", "scheduling.visit_started_late"
  readonly signalType: NamespacedIdentifier;
  readonly subject: SubjectReference;
  readonly detectedAt: string;
  // Exact provenance, always present — Constitution Article IV: "every
  // recommendation retains... the exact version of the rule."  The same
  // discipline applies one level earlier, at Signal creation.
  readonly ruleVersionId: RecordId;
  readonly severity: SignalSeverity;
  readonly status: SignalStatus;
}

// What a Rule is actually allowed to evaluate. HistoricalFact is the
// primary input (event- and state-triggered rules); Signal is included
// because aggregation-level rules (e.g. Community Intelligence rolling up
// other domains' Signals) take Signals as input — see the layered
// architecture reconciliation's Design Question 5. Reference Knowledge will
// be added to this union in Phase E, when it's implemented. Context Note
// must NEVER be added here — see Constitution Article V and the boundary
// tests in __tests__/typeGuarantees.ts.
export type DeterministicRuleInput = HistoricalFact | Signal;

// The three, and only three, approved kinds of thing a Signal's Evidence
// may point at. A fourth kind (e.g. a Context Note) must never be added —
// that is the single hardest boundary in this file.
export type EvidenceReference =
  | { readonly kind: "historical_fact"; readonly factId: RecordId }
  // Reserved for Phase E — Reference Knowledge doesn't exist as a
  // persisted primitive yet, but Evidence's shape is defined now so this
  // union doesn't need to change shape later, only gain a real target.
  | { readonly kind: "reference_knowledge"; readonly referenceKnowledgeId: RecordId }
  | { readonly kind: "signal"; readonly signalId: RecordId };

// EVIDENCE — the structured link between a Signal and the specific thing
// that produced it. Created atomically with its Signal, by the Rule Engine
// only, and never edited afterward.
export interface Evidence {
  readonly id: RecordId;
  readonly signalId: RecordId;
  readonly reference: EvidenceReference;
  // Optional annotation of why this reference matters, e.g. "trigger" vs.
  // "context" — not the same thing as a Context Note; this is metadata
  // about an Evidence link, not narrative knowledge about a subject.
  readonly role: string | null;
}
