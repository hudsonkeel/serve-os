// Source-capability contract — added mid-Phase-1 per an explicit correction:
// we have not confirmed that Viventium, Apploi, or the background-screening
// provider exposes what Background Eligibility needs through any accessible
// API. Nothing in this file, or in sourceAdapters/, may be read as a
// commitment that live integration is imminent — see
// docs/integrations/VIVENTIUM_APPLOI_PLACEHOLDER_BOUNDARIES.md.

// Whether a given capability has actually been confirmed with the vendor.
// "manual"/"file_import" describe a capability Serve currently satisfies
// through a human step, not through the vendor's system at all.
export type SourceCapabilityStatus = "confirmed" | "unverified" | "unavailable" | "manual" | "file_import";

// One vendor's self-declared status for one capability area. Every adapter
// in sourceAdapters/ exports a list of these — in Phase 1, every entry's
// status is "unverified", because no vendor conversation has happened yet.
// See docs/architecture/governance-phase-1-implementation.md's Phase 2
// integration-discovery list for what each of these should resolve to.
export interface SourceCapabilityDeclaration {
  readonly capability: string;
  readonly status: SourceCapabilityStatus;
  readonly note: string;
}

// How a specific piece of evidence was actually obtained. "live_api" is
// listed for completeness — the type this decision type's evidence takes —
// but Phase 1 never produces it: no adapter here calls a live API.
export type EvidenceRetrievalMethod = "live_api" | "file_import" | "manual_verification" | "fixture_demonstration";

// Carried inside HistoricalFact.payload for every finding this decision
// type records — not a kernel-level change (payload is already meant for
// "minimal, normalized fields... specific to what a Rule actually needs to
// evaluate", per lib/intelligence/core/facts.ts). This is what lets the
// Governance Workspace show retrieval method and freshness per evidence
// item, and what stops any UI or document from implying continuous
// monitoring where none exists.
export interface EvidenceRetrievalMetadata {
  readonly externalSubjectId: string | null;
  readonly onboardingOrScreeningStatus: string | null;
  readonly evidenceType: string;
  readonly evidenceAvailable: boolean;
  // ISO 8601 — when a human last verified/confirmed this evidence, not when
  // Serve happened to read it. Null if never verified.
  readonly verifiedAt: string | null;
  readonly sourceSystemLink: string | null;
  readonly retrievalMethod: EvidenceRetrievalMethod;
  // Whether this evidence can be treated as authoritative on its own, or
  // whether it still requires the human confirmation step below before a
  // decision may rely on it.
  readonly isAuthoritative: boolean;
  readonly requiresManualConfirmation: boolean;
}
