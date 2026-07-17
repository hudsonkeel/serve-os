import { createServerClient } from "@/lib/supabase/server";
import {
  ResidentCurrentNeeds,
  ResidentCurrentNeedsSourceType,
} from "@/lib/supabase/types";

const SELECT_COLUMNS =
  "id, resident_id, content, version_number, source_type, source_label, created_by, created_at";

interface ResidentCurrentNeedsRow {
  id: string;
  resident_id: string;
  content: string;
  version_number: number;
  source_type: ResidentCurrentNeedsSourceType;
  source_label: string | null;
  created_by: string | null;
  created_at: string;
}

function toResidentCurrentNeeds(
  row: ResidentCurrentNeedsRow
): ResidentCurrentNeeds {
  return {
    id: row.id,
    residentId: row.resident_id,
    content: row.content,
    versionNumber: row.version_number,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    createdBy: row.created_by,
    createdAt: row.created_at,
    authorName: row.created_by ?? "Unknown",
  };
}

export async function getResidentCurrentNeeds(
  residentId: string
): Promise<ResidentCurrentNeeds | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_current_needs")
    .select(SELECT_COLUMNS)
    .eq("resident_id", residentId)
    .eq("is_current", true)
    .maybeSingle<ResidentCurrentNeedsRow>();

  if (error) {
    console.error("[residentCurrentNeeds:getResidentCurrentNeeds:error]", {
      residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  return data ? toResidentCurrentNeeds(data) : null;
}

export async function getResidentCurrentNeedsHistory(
  residentId: string
): Promise<ResidentCurrentNeeds[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("resident_current_needs")
    .select(SELECT_COLUMNS)
    .eq("resident_id", residentId)
    .order("version_number", { ascending: false });

  if (error) {
    console.error(
      "[residentCurrentNeeds:getResidentCurrentNeedsHistory:error]",
      {
        residentId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
    );
    return [];
  }

  return ((data as ResidentCurrentNeedsRow[] | null) ?? []).map(
    toResidentCurrentNeeds
  );
}

export interface SaveResidentCurrentNeedsRecordInput {
  residentId: string;
  content: string;
  sourceType: ResidentCurrentNeedsSourceType;
  sourceLabel: string | null;
  actor: string;
}

// Supersedes the previous current version and inserts the next one
// atomically via save_resident_current_needs() (see
// 20260716000000_create_resident_current_needs.sql) — the application layer
// never coordinates the "mark old inactive, insert new" sequence itself, so
// a resident can never end up with zero or two active versions.
export async function saveResidentCurrentNeeds(
  input: SaveResidentCurrentNeedsRecordInput
): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("save_resident_current_needs", {
    p_resident_id: input.residentId,
    p_content: input.content,
    p_source_type: input.sourceType,
    p_source_label: input.sourceLabel,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[residentCurrentNeeds:saveResidentCurrentNeeds:error]", {
      residentId: input.residentId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return {
      error: "We couldn't save Current Needs. Your changes are still here — please try again.",
    };
  }

  return {};
}
