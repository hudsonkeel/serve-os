// The known communities.code values (see supabase/migrations/
// 20260813000000_add_canonical_workforce_profile_editor.sql and
// 20260902210000_add_care_model_to_communities.sql), mirrored here as a
// type for compile-time safety in the AxisCare mapping/lifecycle
// modules — never a second source of truth for which communities exist
// (the communities table remains that); this only guards against typos
// in the reviewed mapping tables. Extend when a new communities row is
// seeded, not before.
export type CommunityCode =
  | "watermere_frisco"
  | "watermere_firewheel"
  | "watermere_mckinney"
  | "frisco_lakes"
  | "heritage_ranch";
