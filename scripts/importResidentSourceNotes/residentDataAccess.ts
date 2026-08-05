// Script-compatible data access for residents/current-needs/working-notes.
// lib/data/residents.ts, residentCurrentNeeds.ts, and residentWorkingNotes.ts
// all import via the Next.js "@/" alias, which a plain `node
// --experimental-strip-types` script cannot resolve — see the module
// comment in scripts/importResidentSourceNotes.ts. This file calls the
// EXACT SAME underlying RPCs those files call (save_resident_current_needs,
// create_resident_working_note), through a script-compatible relative
// import, rather than inventing any new write path.
import { createServerClient } from "../../lib/supabase/server.ts";
import type { LiveResident } from "./types.ts";

export async function loadLiveResidents(): Promise<LiveResident[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("residents")
    .select("id, first_name, last_name, display_name, full_name, unit_number")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load residents: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    firstName: r.first_name as string | null,
    lastName: r.last_name as string | null,
    displayName: r.display_name as string | null,
    fullName: r.full_name as string | null,
    unitNumber: r.unit_number as string | null,
  }));
}

export async function getCurrentNeedsContent(residentId: string): Promise<string> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_current_needs")
    .select("content")
    .eq("resident_id", residentId)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load Current Needs for ${residentId}: ${error.message}`);
  }

  return (data?.content as string | undefined) ?? "";
}

export async function saveCurrentNeeds(input: {
  residentId: string;
  content: string;
  sourceLabel: string;
  actor: string;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("save_resident_current_needs", {
    p_resident_id: input.residentId,
    p_content: input.content,
    p_source_type: "document_import",
    p_source_label: input.sourceLabel,
    p_actor: input.actor,
  });

  if (error) return { error: error.message };
  return {};
}

export async function getResidentWorkingNoteContents(residentId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_working_notes")
    .select("content")
    .eq("resident_id", residentId)
    .in("status", ["open", "resolved", "archived"]);

  if (error) {
    throw new Error(`Could not load Working Notes for ${residentId}: ${error.message}`);
  }

  return (data ?? []).map((r) => r.content as string);
}

export async function createResidentWorkingNote(input: {
  residentId: string;
  content: string;
  category: string | null;
  actor: string;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_resident_working_note", {
    p_resident_id: input.residentId,
    p_content: input.content,
    p_category: input.category,
    p_actor: input.actor,
  });

  if (error) return { error: error.message };
  return { id: data as string };
}
