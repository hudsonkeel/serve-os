// Cross-cutting identity, domain, and timestamp concepts shared by every
// Serve Intelligence primitive. See docs/intelligence/SERVE_INTELLIGENCE_CONSTITUTION.md
// and lib/intelligence/core/README.md before adding anything here — this
// file exists so every primitive in this folder speaks the same vocabulary
// instead of each one inventing its own id/domain/timestamp shape.

// A record's permanent identity. Once assigned, an id is never reassigned
// or reused — even a corrected Historical Fact gets a *new* id and points
// back via supersedesFactId, rather than having its own id repurposed.
export type RecordId = string;

// Deliberately open, not a closed union — a new subject type (e.g. a future
// "family_contact") should never require editing this file. The literal
// values below exist for autocomplete/documentation only; TypeScript still
// accepts any string. See Constitution Article X ("every new intelligence
// domain inherits the platform's contract" — the same openness applies to
// subject types a domain might introduce).
export type SubjectType =
  | "resident"
  | "caregiver"
  | "prospect"
  | "employee"
  | "community"
  | (string & {});

// SubjectReference — the minimal pointer every primitive uses to say "this
// is about that" — is defined in subject.ts alongside the Subject registry
// itself, not here, so there is exactly one definition.

// Known intelligence domains as of this writing — see the Constitution's
// Article VI and the layered architecture reconciliation. Kept as a const
// array (not a type-only union) so domain registration can eventually be
// introspected at runtime without a second source of truth.
export const KNOWN_INTELLIGENCE_DOMAINS = [
  "scheduling",
  "relationship",
  "proposal",
  "community",
  "operational",
  "compliance",
  "recruiting",
] as const;

export type KnownIntelligenceDomain = (typeof KNOWN_INTELLIGENCE_DOMAINS)[number];

// Open union, same reasoning as SubjectType: a new domain must never require
// editing this file. "Avoid prematurely creating a closed enum" (Phase A
// design expectations) applies to domains themselves, not just fact/signal
// type suffixes.
export type IntelligenceDomain = KnownIntelligenceDomain | (string & {});

// A namespaced identifier of the shape "domain.specific_name" — used for
// fact types, signal types, recommendation types, and action types.
// Intentionally NOT a closed enum of every possible suffix (there will
// eventually be dozens of these across every domain); the domain prefix is
// still structurally required, which is enough to prevent an unnamespaced,
// ambiguous identifier from type-checking.
export type NamespacedIdentifier = `${IntelligenceDomain}.${string}`;

// Historical Fact's specific timestamp pair — real-world occurrence is
// deliberately distinct from when Serve recorded it. See Constitution
// Article III and the refined architecture's Fact design.
export interface OccurrenceTimestamps {
  readonly occurredAt: string; // ISO 8601 — when it happened in reality
  readonly recordedAt: string; // ISO 8601 — when Serve learned/recorded it
}

// Simple single-timestamp shape for primitives that only need a creation
// time (Recommendation, Action).
export interface CreationTimestamp {
  readonly createdAt: string;
}

// Start/end pair for primitives that represent a bounded execution window
// (Rule Run).
export interface RunTimestamps {
  readonly startedAt: string;
  readonly completedAt: string | null;
}

// A readonly array guaranteed to have at least one element — for primitives
// whose meaning depends on citing real evidence, never empty evidence (e.g.
// LearningObservation.outcomeIds). Generic and reusable by any future
// primitive with the same "must cite at least one X" requirement, rather
// than each one locally duplicating a tuple shape.
export type NonEmptyArray<T> = readonly [T, ...T[]];
