import { createServerClient } from "@/lib/supabase/server";
import { getFollowUpCountsByObservation } from "@/lib/data/wellnessFollowUps";
import {
  CreateWellnessNoteInput,
  ResidentWellnessNote,
  WellnessSignalType,
} from "@/lib/supabase/types";

// Bulk, two-column lookup of each resident's most recent observation date —
// used by the Resident Directory's Wellness Watch display. Cheap enough to
// run on every directory load (single query, no joins); reconsider if this
// table grows very large.
export async function getLastObservedAtByResident(): Promise<Map<string, string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_wellness_notes")
    .select("resident_id, observed_at")
    .order("observed_at", { ascending: false });

  if (error) {
    console.error("[wellnessNotes:getLastObservedAtByResident:error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return new Map();
  }

  const lastObservedAt = new Map<string, string>();
  for (const row of data ?? []) {
    if (!lastObservedAt.has(row.resident_id)) {
      lastObservedAt.set(row.resident_id, row.observed_at);
    }
  }

  return lastObservedAt;
}

interface WellnessNoteRow {
  id: string;
  resident_id: string;
  observed_at: string;
  primary_domain: ResidentWellnessNote["primary_domain"];
  observation: string;
  context: string | null;
  action_taken: string | null;
  follow_up_required: boolean;
  follow_up_date: string | null;
  priority: ResidentWellnessNote["priority"];
  source_system: ResidentWellnessNote["source_system"];
  source_record_id: string | null;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
  resident_wellness_note_signals: { signal_type: WellnessSignalType }[] | null;
}

export async function getWellnessNotes(
  residentId: string
): Promise<ResidentWellnessNote[]> {
  const supabase = createServerClient();
  const [{ data, error }, followUpCounts] = await Promise.all([
    supabase
      .from("resident_wellness_notes")
      .select("*, resident_wellness_note_signals(signal_type)")
      .eq("resident_id", residentId)
      .order("observed_at", { ascending: false }),
    getFollowUpCountsByObservation(residentId),
  ]);

  if (error) {
    console.error("[wellnessNotes:getWellnessNotes:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return ((data as WellnessNoteRow[] | null) ?? []).map((row) => ({
    id: row.id,
    resident_id: row.resident_id,
    observed_at: row.observed_at,
    primary_domain: row.primary_domain,
    observation: row.observation,
    context: row.context,
    action_taken: row.action_taken,
    follow_up_required: row.follow_up_required,
    follow_up_date: row.follow_up_date,
    priority: row.priority,
    source_system: row.source_system,
    source_record_id: row.source_record_id,
    entered_by: row.entered_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    signals: (row.resident_wellness_note_signals ?? []).map(
      (signal) => signal.signal_type
    ),
    followUpCount: followUpCounts.get(row.id) ?? 0,
  }));
}

// Inserts the wellness note, its signals, and any accepted follow-ups as one
// atomic operation via create_resident_wellness_note_with_follow_ups() (see
// 20260712010000_create_resident_wellness_follow_ups.sql) — the application
// layer never coordinates a multi-step insert, and a note can never be left
// stranded with zero signals or with only some of its follow-ups saved.
export async function createWellnessNote(
  input: CreateWellnessNoteInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc(
    "create_resident_wellness_note_with_follow_ups",
    {
      p_resident_id: input.resident_id,
      p_observed_at: input.observed_at ?? null,
      p_primary_domain: input.primary_domain ?? null,
      p_observation: input.observation,
      p_context: input.context ?? null,
      p_action_taken: input.action_taken ?? null,
      p_follow_up_required: input.follow_up_required ?? false,
      p_follow_up_date: input.follow_up_date ?? null,
      p_priority: input.priority ?? "routine",
      p_source_system: input.source_system ?? "serve_os",
      p_source_record_id: input.source_record_id ?? null,
      p_entered_by: input.entered_by ?? null,
      p_signal_types: input.signal_types,
      p_follow_ups: input.follow_ups ?? [],
    }
  );

  if (error) {
    console.error("[wellnessNotes:createWellnessNote:error]", {
      residentId: input.resident_id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save wellness note." };
  }

  return { id: data as string };
}
