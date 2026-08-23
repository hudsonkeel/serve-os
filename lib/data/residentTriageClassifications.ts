// Data layer for the governed, structured triage classification capability
// (supabase/migrations/20260902350000_create_resident_triage_classifications.sql).
// Append-only — mirrors lib/data/residentServeRelationshipCorrections.ts's
// exact shape, with one important difference: "current" is NOT simply the
// latest inserted row. It's the latest row whose effective_date has
// actually arrived (effective_date <= today, tie-broken by created_at
// desc) — a future-dated recording is stored (visible in history) but
// must never take effect early.
import "server-only";
import { createServerClient } from "../supabase/server.ts";
import { isTriageLevelCode, type TriageLevelCode } from "../clientReadiness/triageClassification.ts";

export interface ResidentTriageClassification {
  id: string;
  residentId: string;
  levelCode: TriageLevelCode;
  effectiveDate: string;
  notes: string | null;
  actor: string;
  createdAt: string;
}

interface RawTriageClassificationRow {
  id: string;
  resident_id: string;
  level_code: string;
  effective_date: string;
  notes: string | null;
  actor: string;
  created_at: string;
}

function toResidentTriageClassification(row: RawTriageClassificationRow): ResidentTriageClassification | null {
  if (!isTriageLevelCode(row.level_code)) {
    // Defensive only — the DB check constraint already guarantees this;
    // never surface an un-typed value to a caller rather than throw here.
    console.error("[residentTriageClassifications] unrecognized level_code on a stored row", { id: row.id, levelCode: row.level_code });
    return null;
  }
  return {
    id: row.id,
    residentId: row.resident_id,
    levelCode: row.level_code,
    effectiveDate: row.effective_date,
    notes: row.notes,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

// Full history, newest-recorded-first — for display only. Includes
// future-dated rows that are not yet current.
export async function getResidentTriageClassificationHistory(residentId: string): Promise<ResidentTriageClassification[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_triage_classifications")
    .select("*")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getResidentTriageClassificationHistory]", { residentId, message: error.message });
    return [];
  }

  return ((data as RawTriageClassificationRow[] | null) ?? [])
    .map(toResidentTriageClassification)
    .filter((row): row is ResidentTriageClassification => row !== null);
}

// The classification that governs RIGHT NOW: the latest row whose
// effective_date is today or earlier, tie-broken by created_at desc among
// same-day entries. A row recorded ahead of time with a future
// effective_date is deliberately excluded here (it still shows up in
// getResidentTriageClassificationHistory above) — this is what "must not
// become current early" means in practice.
export async function getCurrentResidentTriageClassification(residentId: string): Promise<ResidentTriageClassification | null> {
  const supabase = createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("resident_triage_classifications")
    .select("*")
    .eq("resident_id", residentId)
    .lte("effective_date", today)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[getCurrentResidentTriageClassification]", { residentId, message: error.message });
    return null;
  }
  if (!data) return null;

  return toResidentTriageClassification(data as RawTriageClassificationRow);
}

export async function recordResidentTriageClassification(input: {
  residentId: string;
  levelCode: TriageLevelCode;
  effectiveDate: string;
  notes: string | null;
  actor: string;
}): Promise<{ classification?: ResidentTriageClassification; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("record_resident_triage_classification", {
      p_resident_id: input.residentId,
      p_level_code: input.levelCode,
      p_effective_date: input.effectiveDate,
      p_notes: input.notes,
      p_actor: input.actor,
    })
    .single();

  if (error) {
    return { error: `Could not record triage classification: ${error.message}` };
  }

  const classification = toResidentTriageClassification(data as RawTriageClassificationRow);
  if (!classification) {
    return { error: "Triage classification was recorded but could not be read back." };
  }
  return { classification };
}
