import type {
  ConnectionSourceType,
  InterestConfidence,
  InterestType,
} from "@/lib/supabase/types";

// Pure mapping logic for Getting to Know (the renamed/refined Connections
// feature). The underlying schema (resident_interests' 16-value
// interest_type, 6-value source_type, 3-value confidence) is unchanged —
// see docs/design/RESIDENT_MEMORY.md and
// supabase/migrations/20260711000000_create_resident_connections.sql. This
// module only translates between that schema and two simpler surfaces:
// a friendlier data-entry form, and a small set of display groups for
// rendering. No data is lost — every existing interest_type/source_type/
// confidence value still round-trips through here into a display group or
// a human label; nothing is dropped on the floor.

// ─── Simplified entry form → existing schema ──────────────────────────

export type SimpleLearnedType =
  | "favorite_interest"
  | "family_important_person"
  | "conversation_cue"
  | "preference"
  | "routine"
  | "little_detail"
  | "other";

export const SIMPLE_LEARNED_TYPE_OPTIONS: {
  value: SimpleLearnedType;
  label: string;
}[] = [
  { value: "favorite_interest", label: "Favorite / Interest" },
  { value: "family_important_person", label: "Family / Important Person" },
  { value: "conversation_cue", label: "Conversation Cue" },
  { value: "preference", label: "Preference" },
  { value: "routine", label: "Routine" },
  { value: "little_detail", label: "Little Detail" },
  { value: "other", label: "Other" },
];

// Three of the seven simple types (preference/routine/little_detail) have
// no closely-matching existing interest_type — they all land on "other".
// That's intentional, not a gap: getDisplayGroupForInterestType() below
// sends "other" to the "preference" display group, which is exactly where
// a user who picked Preference/Routine/Little Detail expects to see their
// entry again. The free-text interest_value/details fields carry the real
// content regardless of which of the three collapses onto "other".
export function mapSimpleLearnedTypeToInterestType(
  simple: SimpleLearnedType
): InterestType {
  switch (simple) {
    case "favorite_interest":
      return "hobby";
    case "family_important_person":
      return "family";
    case "conversation_cue":
      return "conversation_topic";
    case "preference":
    case "routine":
    case "little_detail":
    case "other":
    default:
      return "other";
  }
}

export type SimpleSource =
  | "resident_shared"
  | "family_shared"
  | "community_staff_shared"
  | "serve_staff_observed"
  | "assessment"
  | "other";

export const SIMPLE_SOURCE_OPTIONS: { value: SimpleSource; label: string }[] = [
  { value: "resident_shared", label: "Resident shared" },
  { value: "family_shared", label: "Family shared" },
  { value: "community_staff_shared", label: "Community staff shared" },
  { value: "serve_staff_observed", label: "Serve staff observed" },
  { value: "assessment", label: "Assessment" },
  { value: "other", label: "Other" },
];

export function mapSimpleSourceToSourceType(
  simple: SimpleSource
): ConnectionSourceType {
  switch (simple) {
    case "resident_shared":
      return "resident_shared";
    case "family_shared":
      return "family_shared";
    case "community_staff_shared":
      return "staff_conversation";
    case "serve_staff_observed":
      return "staff_observation";
    case "assessment":
      return "imported";
    case "other":
    default:
      return "other";
  }
}

export type SimpleConfidence =
  | "observed"
  | "shared_by_someone"
  | "confirmed_by_resident";

export const SIMPLE_CONFIDENCE_OPTIONS: {
  value: SimpleConfidence;
  label: string;
}[] = [
  { value: "observed", label: "Observed" },
  { value: "shared_by_someone", label: "Shared by someone" },
  { value: "confirmed_by_resident", label: "Confirmed by resident" },
];

export function mapSimpleConfidenceToConfidence(
  simple: SimpleConfidence
): InterestConfidence {
  switch (simple) {
    case "observed":
      return "unconfirmed";
    case "shared_by_someone":
      return "probable";
    case "confirmed_by_resident":
      return "confirmed";
    default:
      return "unconfirmed";
  }
}

// resident_interests.confirmed_by_resident is a separate stored boolean
// (not derived from `confidence` at the DB layer) — the simplified form
// asks the confidence question once and derives this instead of asking
// twice, but the underlying column is still written explicitly.
export function isConfirmedByResident(simple: SimpleConfidence): boolean {
  return simple === "confirmed_by_resident";
}

// ─── Existing schema → display grouping ───────────────────────────────

export type InterestDisplayGroup =
  | "enjoys"
  | "family"
  | "conversation_cue"
  | "preference";

export const INTEREST_DISPLAY_GROUP_LABELS: Record<InterestDisplayGroup, string> = {
  enjoys: "Things They Enjoy",
  family: "Family & Important People",
  conversation_cue: "Conversation Cues",
  preference: "Preferences & Little Details",
};

// Deterministic, total mapping — every InterestType value (including any
// added in the future) resolves to exactly one display group, defaulting
// unrecognized/"other" values to "preference" rather than being dropped.
export function getDisplayGroupForInterestType(
  type: InterestType
): InterestDisplayGroup {
  switch (type) {
    case "hobby":
    case "sports_team":
    case "music":
    case "books":
    case "food":
    case "travel":
    case "community_activity":
    case "college":
      return "enjoys";
    case "family":
    case "pets":
      return "family";
    case "conversation_topic":
      return "conversation_cue";
    case "hometown":
    case "former_profession":
    case "military_service":
    case "faith_or_tradition":
    case "other":
    default:
      return "preference";
  }
}
