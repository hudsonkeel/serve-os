import { createServerClient } from "@/lib/supabase/server";
import type { QapiDomainId, QapiDomainNote } from "@/lib/supabase/types";

// Data layer for qapi_domain_notes — see
// supabase/migrations/20260906000000_create_qapi_domain_notes.sql. Mirrors
// lib/data/residentCurrentNeeds.ts's read/write shape exactly (get current,
// get history, save via one atomic RPC); the only structural difference is
// the subject key (domain_id, a closed 3-value union, instead of
// resident_id) and the absence of source_type/source_label, which
// resident_current_needs carries for future non-UI writers this table has
// no equivalent of yet.

const SELECT_COLUMNS = "id, domain_id, content, version_number, created_by, created_at";

interface QapiDomainNoteRow {
  id: string;
  domain_id: QapiDomainId;
  content: string;
  version_number: number;
  created_by: string;
  created_at: string;
}

function toQapiDomainNote(row: QapiDomainNoteRow): QapiDomainNote {
  return {
    id: row.id,
    domainId: row.domain_id,
    content: row.content,
    versionNumber: row.version_number,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function getQapiDomainNote(domainId: QapiDomainId): Promise<QapiDomainNote | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("qapi_domain_notes")
    .select(SELECT_COLUMNS)
    .eq("domain_id", domainId)
    .eq("is_current", true)
    .maybeSingle<QapiDomainNoteRow>();

  if (error) {
    console.error("[qapiDomainNotes:getQapiDomainNote:error]", { domainId, message: error.message });
    return null;
  }

  return data ? toQapiDomainNote(data) : null;
}

// Fetches the current note for every domain in one query rather than three
// — the QAPI page always needs all three at once.
export async function getQapiDomainNotes(): Promise<Record<QapiDomainId, QapiDomainNote | null>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("qapi_domain_notes")
    .select(SELECT_COLUMNS)
    .eq("is_current", true)
    .returns<QapiDomainNoteRow[]>();

  const result: Record<QapiDomainId, QapiDomainNote | null> = {
    workforce: null,
    client_readiness: null,
    emergency_preparedness: null,
  };

  if (error) {
    console.error("[qapiDomainNotes:getQapiDomainNotes:error]", { message: error.message });
    return result;
  }

  for (const row of data ?? []) {
    result[row.domain_id] = toQapiDomainNote(row);
  }

  return result;
}

export async function getQapiDomainNoteHistory(domainId: QapiDomainId): Promise<QapiDomainNote[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("qapi_domain_notes")
    .select(SELECT_COLUMNS)
    .eq("domain_id", domainId)
    .order("version_number", { ascending: false })
    .returns<QapiDomainNoteRow[]>();

  if (error) {
    console.error("[qapiDomainNotes:getQapiDomainNoteHistory:error]", { domainId, message: error.message });
    return [];
  }

  return (data ?? []).map(toQapiDomainNote);
}

export interface SaveQapiDomainNoteInput {
  domainId: QapiDomainId;
  content: string;
  actor: string;
}

// Supersedes the previous current version and inserts the next one
// atomically via save_qapi_domain_note() — the application layer never
// coordinates the "mark old inactive, insert new" sequence itself, so a
// domain can never end up with zero or two current notes. A no-op save
// (identical content) is a normal, silent success — see the RPC's own
// comment.
export async function saveQapiDomainNote(input: SaveQapiDomainNoteInput): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("save_qapi_domain_note", {
    p_domain_id: input.domainId,
    p_content: input.content,
    p_actor: input.actor,
  });

  if (error) {
    console.error("[qapiDomainNotes:saveQapiDomainNote:error]", { domainId: input.domainId, message: error.message });
    return { error: "We couldn't save this note. Your changes are still here — please try again." };
  }

  return {};
}
