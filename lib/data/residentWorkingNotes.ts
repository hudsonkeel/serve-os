import { createServerClient } from "@/lib/supabase/server";
import {
  ResidentWorkingNote,
  WorkingNoteCategory,
  WorkingNoteStatus,
} from "@/lib/supabase/types";

const SELECT_COLUMNS =
  "id, resident_id, content, category, status, resolved, resolved_at, resolved_by, created_at, created_by, updated_at, updated_by, archived_at";

interface ResidentWorkingNoteRow {
  id: string;
  resident_id: string;
  content: string;
  category: WorkingNoteCategory | null;
  status: WorkingNoteStatus;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  archived_at: string | null;
}

function toResidentWorkingNote(row: ResidentWorkingNoteRow): ResidentWorkingNote {
  return {
    id: row.id,
    residentId: row.resident_id,
    content: row.content,
    category: row.category,
    status: row.status,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    archivedAt: row.archived_at,
  };
}

// Open and resolved notes only — archived notes are intentionally hidden
// from the default Working Notes list (no archived-notes view exists yet).
export async function getResidentWorkingNotes(
  residentId: string
): Promise<ResidentWorkingNote[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_working_notes")
    .select(SELECT_COLUMNS)
    .eq("resident_id", residentId)
    .in("status", ["open", "resolved"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[residentWorkingNotes:getResidentWorkingNotes:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return ((data as ResidentWorkingNoteRow[] | null) ?? []).map(
    toResidentWorkingNote
  );
}

export interface CreateResidentWorkingNoteInput {
  residentId: string;
  content: string;
  category: WorkingNoteCategory | null;
  actor: string;
}

// Inserts the note and its "working note added" timeline event atomically
// via create_resident_working_note() (see
// 20260716020000_create_resident_working_notes.sql).
export async function createResidentWorkingNote(
  input: CreateResidentWorkingNoteInput
): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("create_resident_working_note", {
    p_resident_id: input.residentId,
    p_content: input.content,
    p_category: input.category,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[residentWorkingNotes:createResidentWorkingNote:error]", {
      residentId: input.residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not save working note." };
  }

  return { id: data as string };
}

export async function resolveResidentWorkingNote(
  workingNoteId: string,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("resolve_resident_working_note", {
    p_working_note_id: workingNoteId,
    p_actor: actor,
  });

  if (error) {
    console.error("[residentWorkingNotes:resolveResidentWorkingNote:error]", {
      workingNoteId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not resolve working note." };
  }

  return {};
}

export async function archiveResidentWorkingNote(
  workingNoteId: string,
  actor: string
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("archive_resident_working_note", {
    p_working_note_id: workingNoteId,
    p_actor: actor,
  });

  if (error) {
    console.error("[residentWorkingNotes:archiveResidentWorkingNote:error]", {
      workingNoteId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { error: "Could not archive working note." };
  }

  return {};
}
