// The single, deterministic Serve relationship projection for a
// canonical resident — replaces the current Residents-page split
// between resident.serve_relationship_status (+ staged import
// overlay), the Relationships CRM override, and (previously) zero
// awareness of AxisCare at all.
//
// Governing model (People We Serve refactor): Serve owns the person and
// the relationship. AxisCare is the canonical EXTERNAL client
// repository — when a resident has a real AxisCare client match, that
// match is authoritative for the relationship. CINCH is an operational
// delivery system, never a relationship source. This module is a pure
// combinator over already-computed inputs — it does not query anything
// itself, does not introduce a new identity-matching system (reuses
// lib/integrations/axiscare/clientIdentityMatching.ts's and
// lib/data/axiscareClientOperationalSummary.ts's existing evidence),
// and never resolves an ambiguous identity on its own — identity
// confidence is surfaced as a separate dimension, never used to hide a
// real operational relationship (see AxisCareIdentityStatus's own
// contract in clientOperationalStatus.ts).
import type { ServeRelationshipStatus } from "@/lib/supabase/types";
import type { AxisCareClientOperationalBucket, AxisCareIdentityStatus } from "@/lib/integrations/axiscare/clientOperationalStatus";
import type { ClientMatchBasis } from "@/lib/integrations/axiscare/clientIdentityMatching";

export type ServeRelationship =
  | "prospect"
  | "active_client"
  | "inactive_client"
  | "no_current_relationship"
  | "needs_review";

export type ServeRelationshipSource = "axiscare" | "crm_relationship" | "legacy_resident_status" | "none" | "human_correction";

export type ServeDeliverySystem = "axiscare" | "cinch" | "both" | "none";

// The AxisCare bucket a "real client relationship" can come from — never
// "excluded". A disposition-excluded AxisCare record (e.g. a related
// person mistakenly created as a client) does not represent a real
// client relationship for the matched resident, so callers must never
// construct this input from an excluded row.
export type AxisCareRelationshipBucket = Exclude<AxisCareClientOperationalBucket, "excluded">;

export interface AxisCareRelationshipMatch {
  readonly axiscareId: string;
  readonly operationalBucket: AxisCareRelationshipBucket;
  readonly identityStatus: AxisCareIdentityStatus;
  // Display/decision-support fields for identity-resolution UI —
  // optional since projectServeRelationship()'s own decision logic below
  // never reads them (identity confidence is a separate dimension, never
  // used to hide a real operational relationship — see this module's own
  // header comment). Populated by residentServeRelationships.ts's
  // buildResidentAxisCareMatches() from the full
  // AxisCareClientOperationalRow; absent in synthetic/older inputs.
  readonly vendorDisplayName?: string;
  readonly matchBasis?: ClientMatchBasis;
  readonly statusLabel?: string | null;
  readonly statusActive?: boolean;
  readonly classes?: readonly string[];
}

export interface RelevantRelationship {
  readonly relationshipType: string;
  readonly stage: string;
  readonly status: string;
}

export interface ServeRelationshipProjectionInput {
  // The existing resident-level status (already combines staged import
  // overlay + the resident's own column, per communityMetrics.ts's
  // existing precedence) — passed through WITHOUT
  // collapseLegacyProspectStatus applied, since this projection wants
  // 'prospect' as a real, first-class value, not collapsed to 'none'.
  readonly legacyResidentStatus: ServeRelationshipStatus;
  // Every active (non-closed) Relationship linked to this resident
  // (lib/data/relationships.ts's getActiveRelationshipSummariesByResident()) —
  // reused as-is, not re-queried or re-matched here.
  readonly activeRelationships: readonly RelevantRelationship[];
  // The single best AxisCare client match for this resident, or null if
  // none exists. Never an excluded-bucket row (see
  // AxisCareRelationshipBucket above).
  readonly axiscareMatch: AxisCareRelationshipMatch | null;
  // Whether a staged CINCH status string exists for this resident
  // (resident_relationship_imports.cinch_status) — display/delivery-
  // system evidence only, never a relationship-status source in its own
  // right (CINCH is an operational system, not a relationship owner).
  readonly hasCinchEvidence: boolean;
}

export interface ServeRelationshipProjection {
  readonly relationship: ServeRelationship;
  readonly relationshipSource: ServeRelationshipSource;
  // Independent operational flag — an active_client (or, less commonly,
  // any other relationship) can simultaneously be on hold. Never itself
  // a top-level relationship value.
  readonly onHold: boolean;
  // Only populated when relationship === 'prospect' and a linked CRM
  // Relationship's pipeline stage is known.
  readonly prospectStage: string | null;
  readonly deliverySystem: ServeDeliverySystem;
}

function hasActiveClientRelationship(relationships: readonly RelevantRelationship[]): boolean {
  return relationships.some((r) => r.relationshipType === "active_client");
}

function hasProspectRelationship(relationships: readonly RelevantRelationship[]): boolean {
  return relationships.some((r) => r.relationshipType === "resident_prospect" || r.relationshipType === "external_prospect");
}

function hasOnHoldRelationship(relationships: readonly RelevantRelationship[]): boolean {
  return relationships.some((r) => r.status === "on_hold" || r.stage === "on_hold");
}

function firstProspectStage(relationships: readonly RelevantRelationship[]): string | null {
  const prospectRelationship = relationships.find(
    (r) => r.relationshipType === "resident_prospect" || r.relationshipType === "external_prospect"
  );
  return prospectRelationship?.stage ?? null;
}

export function projectServeRelationship(input: ServeRelationshipProjectionInput): ServeRelationshipProjection {
  // onHold is governed/CRM-relationship-sourced ONLY (hasOnHoldRelationship)
  // — never derived from legacyResidentStatus. That raw column (and its
  // staged-import overlay) can carry a historical CINCH-imported 'hold'
  // value, and CINCH is never a relationship source (see this module's
  // own header comment) — current or otherwise. A real "On Hold" state
  // must come from an actual governed CRM Relationship, not a vendor
  // import artifact.
  const onHold = hasOnHoldRelationship(input.activeRelationships);

  let relationship: ServeRelationship;
  let relationshipSource: ServeRelationshipSource;

  if (input.axiscareMatch) {
    // AxisCare is the canonical external client repository — when a real
    // match exists (regardless of identity confidence; identity is a
    // separate dimension, see AxisCareIdentityStatus), it is
    // authoritative for the relationship.
    relationship = input.axiscareMatch.operationalBucket;
    relationshipSource = "axiscare";
  } else if (hasActiveClientRelationship(input.activeRelationships)) {
    // A real Serve-native active engagement with no AxisCare match yet
    // (e.g. service delivered before/outside the AxisCare integration).
    relationship = "active_client";
    relationshipSource = "crm_relationship";
  } else if (hasProspectRelationship(input.activeRelationships)) {
    relationship = "prospect";
    relationshipSource = "crm_relationship";
  } else {
    // No AxisCare match, no linked CRM relationship carrying its own
    // relationship signal — fall back to the resident's own legacy
    // status. 'hold' implies an underlying active relationship, paused
    // (onHold is already captured above). 'wellness_watch' is a legacy
    // import quirk, not a real relationship signal — the actual
    // Wellness Watch flag is computed independently elsewhere and never
    // gates this dimension.
    switch (input.legacyResidentStatus) {
      case "active_client":
      case "hold":
        relationship = "active_client";
        relationshipSource = "legacy_resident_status";
        break;
      case "former_client":
        relationship = "inactive_client";
        relationshipSource = "legacy_resident_status";
        break;
      case "prospect":
        relationship = "prospect";
        relationshipSource = "legacy_resident_status";
        break;
      case "wellness_watch":
      case "none":
      default:
        relationship = "no_current_relationship";
        relationshipSource = "none";
        break;
    }
  }

  const deliverySystem: ServeDeliverySystem = input.axiscareMatch
    ? input.hasCinchEvidence
      ? "both"
      : "axiscare"
    : input.hasCinchEvidence
      ? "cinch"
      : "none";

  return {
    relationship,
    relationshipSource,
    onHold,
    prospectStage: relationship === "prospect" ? firstProspectStage(input.activeRelationships) : null,
    deliverySystem,
  };
}

// ─── Governed human correction ("fix incorrect stuff") ────────────────
//
// A reviewed human correction represents durable Serve canonical
// truth and takes precedence over the naturally-computed projection
// above — but later, DIFFERENT vendor/CRM evidence must never silently
// overwrite it. Instead, the correction still wins for display, and
// the disagreement is surfaced as a real conflict for reconciliation,
// never silently resolved either direction. This is intentionally not
// a way to mask a known software defect in the projection logic itself
// (e.g. the AxisCare matching gaps found and fixed this session) — a
// defect should be fixed at its source, not papered over with a
// standing correction.
export interface ServeRelationshipCorrection {
  readonly newValue: ServeRelationship;
  readonly previousValue: ServeRelationship | null;
  readonly actor: string;
  readonly rationale: string;
  readonly createdAt: string;
}

export interface ServeRelationshipProjectionWithCorrection extends ServeRelationshipProjection {
  readonly correction: ServeRelationshipCorrection | null;
  // The live, uncorrected natural/source relationship — always the
  // current output of projectServeRelationship(), regardless of whether
  // a correction exists. Exposed (rather than discarded once a
  // correction is applied) so a caller recording a NEW correction can
  // seed that correction's own previousValue from the true current
  // source state, never from `relationship` below, which — once a
  // correction exists — is already the prior correction's own chosen
  // value. Feeding `relationship` back in as a future previousValue is
  // exactly the contamination bug this field exists to prevent (see
  // hasConflict's comment).
  readonly naturalRelationship: ServeRelationship;
  // True only when the CURRENT natural/source relationship differs from
  // correction.previousValue — the natural value the human actually
  // reviewed at the time they made this correction. This asks "has the
  // source changed since it was reviewed," not "does the source still
  // disagree with what the human chose" (comparing against
  // correction.newValue instead would be wrong: a correction exists
  // specifically because the human's chosen value disagreed with the
  // source at review time, so that comparison is true by construction
  // for nearly every real correction, forever, regardless of whether
  // anything has actually changed since). A null previousValue (no
  // captured baseline — the app itself never writes one, but the schema
  // allows it defensively) is treated as an unresolved/unknown baseline,
  // so it conservatively stays a conflict rather than silently hiding
  // one. The correction still wins for display either way; this flag
  // exists purely so a genuinely new disagreement can be surfaced, never
  // acted on automatically.
  readonly hasConflict: boolean;
}

export function applyServeRelationshipCorrection(
  naturalProjection: ServeRelationshipProjection,
  correction: ServeRelationshipCorrection | null
): ServeRelationshipProjectionWithCorrection {
  if (!correction) {
    return { ...naturalProjection, correction: null, hasConflict: false, naturalRelationship: naturalProjection.relationship };
  }

  return {
    ...naturalProjection,
    relationship: correction.newValue,
    relationshipSource: "human_correction",
    correction,
    naturalRelationship: naturalProjection.relationship,
    hasConflict:
      correction.previousValue === null ? true : naturalProjection.relationship !== correction.previousValue,
  };
}
