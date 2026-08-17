// Data layer for the `agencies` reference table — see
// supabase/migrations/20260902070000_add_agencies_and_widen_agency_subject.sql.
// Reference data; no write path in this phase (agencies are seeded by
// migration, not created at runtime, matching person_requirements'
// existing convention).
import { createServerClient } from "../supabase/server.ts";
import type { Agency } from "../supabase/types.ts";

// The stable lookup key — a real reference-data identifier, never an
// implicit "first row wins" query. Adding a second agency later is a plain
// insert plus a second slug reference; no lookup-mechanism change.
export async function getAgencyBySlug(slug: string): Promise<Agency | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("agencies").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    console.error("[getAgencyBySlug]", { slug, message: error.message });
    return null;
  }

  return (data as Agency | null) ?? null;
}
