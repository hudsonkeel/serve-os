// Shared types for the one-time resident source-notes import. See
// docs/design/RELATIONSHIPS.md, docs/engineering/TEST_DATA_HYGIENE.md, and
// the resident Current Needs/Working Notes/Timeline/Service Opportunity
// migrations this import writes through.

// ─── Source data shapes ────────────────────────────────────────────────────

export interface Source1Record {
  readonly kind: "needs_sheet";
  readonly sourceId: "resident_service_needs_photo_2026_07";
  readonly recordIndex: number;
  readonly apartment: string;
  // One name for an individual resident, two for a couple entry.
  readonly residentNames: readonly string[];
  readonly needs: readonly string[];
  // Only set where the source's original wording must be preserved
  // verbatim rather than normalized (e.g. "legs are bad").
  readonly originalWording?: string;
  // Free-text guidance carried over from the transcription — never written
  // to the database, only used to drive this script's own routing.
  readonly transcriptionNote?: string;
}

export type WhiteboardDestination =
  | "relationship_working_note"
  | "resident_working_note"
  | "service_opportunity"
  | "timeline_or_dated_note"
  | "current_needs_reinforce";

export interface Source2Record {
  readonly kind: "whiteboard";
  readonly sourceId: "watermere_whiteboard_photo_2026_06_07";
  readonly recordIndex: number;
  // Exactly as written on the whiteboard — may be a first-name-only pair,
  // an initial + last name, or a full name.
  readonly personLabel: string;
  readonly apartmentHint?: string;
  readonly apartmentHintConfidence?: "low" | "medium";
  readonly proposedDays?: string;
  readonly proposedTimes?: readonly string[];
  readonly proposedDuration?: string;
  readonly frequency?: string;
  readonly need?: string;
  readonly contextNote?: string;
  readonly statusNote?: string;
  readonly historicalNote?: string;
  readonly destinations: readonly WhiteboardDestination[];
  readonly synthenticDataPolicyFlag?: boolean;
  readonly sourceTextUncertain?: boolean;
  readonly doNotInferNote?: string;
}

export type SourceRecord = Source1Record | Source2Record;

// ─── Live data snapshot (loaded once, read-only) ──────────────────────────

export interface LiveResident {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly displayName: string | null;
  readonly fullName: string | null;
  readonly unitNumber: string | null;
}

export interface LiveRelationship {
  readonly id: string;
  readonly residentId: string | null;
  readonly relationshipType: string;
  readonly status: string;
  readonly displayName: string;
  readonly updatedAt: string;
}

// ─── Matching ──────────────────────────────────────────────────────────────

export type MatchConfidence = "high" | "medium" | "low" | "none";

export type MatchMethod =
  | "apartment_and_name"
  | "apartment_and_partial_name"
  | "apartment_single_occupant_only"
  | "unique_normalized_full_name"
  | "first_name_pair"
  | "no_match";

export interface MatchResult {
  readonly sourceName: string;
  readonly sourceApartment: string | null;
  readonly status: "matched" | "ambiguous" | "unmatched";
  readonly residentId: string | null;
  readonly residentName: string | null;
  readonly residentUnit: string | null;
  readonly confidence: MatchConfidence;
  readonly method: MatchMethod;
  readonly reason: string;
  readonly ambiguousCandidateIds?: readonly string[];
}

// ─── Planned writes (dry-run preview + apply both consume this) ──────────

export type PlannedWriteKind =
  | "current_needs_append"
  | "resident_working_note"
  | "relationship_working_note"
  | "relationship_service_opportunity"
  | "relationship_create";

export type PlannedWriteStatus =
  | "will_write"
  | "no_change_needed"
  | "skipped_duplicate"
  | "skipped_synthetic_policy"
  | "skipped_ambiguous"
  | "skipped_unmatched"
  | "skipped_uncertain_destination";

export interface PlannedWrite {
  readonly sourceId: string;
  readonly recordIndex: number;
  readonly kind: PlannedWriteKind;
  readonly status: PlannedWriteStatus;
  readonly residentId: string | null;
  readonly residentName: string | null;
  readonly relationshipId: string | null;
  readonly description: string;
  // The exact content that would be written (or was skipped), for preview.
  readonly content?: string;
  readonly reason: string;
}
