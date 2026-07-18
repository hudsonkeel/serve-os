import type { IntelligenceDomain, NamespacedIdentifier, NonEmptyArray, RecordId } from "./shared.ts";
import type { SubjectReference } from "./subject.ts";
import type { ProvenanceConfidence } from "./provenance.ts";

// A Learning Observation's substantive content never changes once created;
// `status` is the one field permitted to transition, and only along this
// lifecycle. See the interface comment for what "append-only" means here.
export type LearningObservationStatus = "open" | "acknowledged" | "incorporated" | "dismissed";

// LEARNING OBSERVATION — a candidate organizational insight: a pattern
// noticed across one or more Outcomes that may, after human review, lead to
// an actual improvement somewhere in the organization. It is not itself a
// change to anything, and it never becomes one automatically — see
// Constitution Article II. This is a shared kernel primitive, not a
// Governance-specific one: Scheduling, Relationships, Proposals, a future
// Financial Intelligence domain, and Governance all produce Outcomes, and
// any of them can surface a pattern worth a human looking at.
//
// Immutability boundary: every field below except `status` is fixed at
// creation and never rewritten — the observed pattern, its reasoning, and
// its evidence are a record of what was noticed, not a living document.
// `status` is the one exception, and its transitions must themselves be
// auditable (a future persistence layer is expected to retain a
// status-change history alongside this record — not built in Phase A,
// same as every other primitive here having no persistence yet). If a
// later insight supersedes this one, that is a NEW LearningObservation,
// never a rewrite of this one's substantive fields — the same discipline
// HistoricalFact.supersedesFactId already establishes for facts, applied
// here to insights instead.
export interface LearningObservation {
  readonly id: RecordId;
  readonly domain: IntelligenceDomain;
  // e.g. "compliance.policy_gap_identified", "scheduling.rule_threshold_drift"
  readonly observationType: NamespacedIdentifier;
  // Null when the observation is aggregate (a pattern across many subjects),
  // not tied to one case — e.g. "three Reviewable classifications this
  // quarter cited the same undocumented offense category."
  readonly subject: SubjectReference | null;
  // The Outcome(s) this pattern was drawn from — at least one is required
  // by the type itself: an observation with no Outcome evidence is a
  // hypothesis, not a Learning Observation.
  readonly outcomeIds: NonEmptyArray<RecordId>;
  readonly summary: string;
  // Why the observed pattern is meaningful — the reasoning a human would
  // need to evaluate whether this observation is worth acting on, not just
  // a restatement of `summary`.
  readonly reasoning: string;
  // Reuses ProvenanceConfidence (provenance.ts) rather than introducing a
  // second confidence vocabulary. Here it represents the epistemic basis of
  // the observation itself, not the sourcing of a Fact:
  //   - "confirmed" — the pattern is directly supported by sufficient
  //     Outcome evidence.
  //   - "inferred"  — the pattern is reasonably inferred from available
  //     Outcome evidence, but the evidence base is thinner.
  //   - "unknown"   — available evidence is insufficient to establish the
  //     pattern confidently; surfaced anyway because it may still be worth
  //     a human's attention.
  // Not a numeric probability score.
  readonly confidence: ProvenanceConfidence;
  // Deliberately broad — an observation may point at an improvement to
  // policy, workflow, automation, training, data collection, documentation,
  // decision logic, or governance practice generally. Never an executable
  // pointer: this primitive never directly modifies a policy, Rule,
  // workflow, or any other software or document — a human resolves it, the
  // same non-execution boundary Recommendation holds (Constitution Article
  // II/VIII).
  readonly recommendedImprovement: string | null;
  readonly status: LearningObservationStatus;
  readonly createdAt: string;
}
