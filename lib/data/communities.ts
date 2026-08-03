// Data layer for the first normalized Community entity in Serve OS — see
// supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
// Read-only from the application today; communities are seeded by
// migration, not created through the UI (Phase 3's "community launch
// wizard" is explicitly out of scope for this pass).
import { createServerClient } from "../supabase/server.ts";
import type { Community } from "../supabase/types.ts";

export async function listCommunities(): Promise<Community[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("communities").select("*").eq("is_active", true).order("name");

  if (error) {
    console.error("[listCommunities]", { message: error.message });
    return [];
  }

  return (data as Community[] | null) ?? [];
}

export async function getCommunityById(id: string): Promise<Community | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("communities").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[getCommunityById]", { id, message: error.message });
    return null;
  }

  return (data as Community | null) ?? null;
}
