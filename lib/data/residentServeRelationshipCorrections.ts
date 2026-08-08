// Data layer for the governed Serve relationship correction capability
// (supabase/migrations/20260826000000_add_resident_serve_relationship_corrections.sql).
// Append-only — see that migration's own comment for why "current
// value = latest row" is sufficient for "supersedable/reversible
// without deleting history."
import "server-only";
import { createServerClient } from "../supabase/server.ts";
import type { ServeRelationship, ServeRelationshipCorrection } from "../residents/serveRelationshipProjection.ts";

interface RawCorrectionRow {
  resident_id: string;
  previous_value: string | null;
  new_value: string;
  actor: string;
  rationale: string;
  created_at: string;
}

// Bulk read, keyed by resident id — every reconciliation/residents pass
// needs "the latest correction per resident," not N queries.
export async function getLatestServeRelationshipCorrections(): Promise<Map<string, ServeRelationshipCorrection>> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("resident_serve_relationship_corrections")
    .select("resident_id, previous_value, new_value, actor, rationale, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getLatestServeRelationshipCorrections]", { message: error.message });
    return new Map();
  }

  const byResident = new Map<string, ServeRelationshipCorrection>();
  for (const row of (data as RawCorrectionRow[] | null) ?? []) {
    // Rows are ordered newest-first; the first one seen per resident is
    // the current value.
    if (byResident.has(row.resident_id)) continue;
    byResident.set(row.resident_id, {
      newValue: row.new_value as ServeRelationship,
      previousValue: row.previous_value as ServeRelationship | null,
      actor: row.actor,
      rationale: row.rationale,
      createdAt: row.created_at,
    });
  }
  return byResident;
}

export async function correctResidentServeRelationship(input: {
  residentId: string;
  previousValue: ServeRelationship | null;
  newValue: ServeRelationship;
  actor: string;
  rationale: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.rpc("correct_resident_serve_relationship", {
    p_resident_id: input.residentId,
    p_previous_value: input.previousValue,
    p_new_value: input.newValue,
    p_actor: input.actor,
    p_rationale: input.rationale,
  });

  if (error) {
    return { error: `Could not correct Serve relationship: ${error.message}` };
  }
  return {};
}
