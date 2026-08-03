// Data layer for the platform-owned, polymorphic document metadata table.
// See supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql.
// Actual file bytes go through lib/workforce/storage.ts (Supabase Storage);
// this file only ever handles the metadata row.
import { createServerClient } from "../supabase/server.ts";
import type { PersonDocument, PersonSubjectType } from "../supabase/types.ts";

export async function getPersonDocumentsForSubject(
  subjectType: PersonSubjectType,
  subjectId: string
): Promise<PersonDocument[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_documents")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("[getPersonDocumentsForSubject]", { subjectType, subjectId, message: error.message });
    return [];
  }

  return (data as PersonDocument[] | null) ?? [];
}

export async function getPersonDocumentById(id: string): Promise<PersonDocument | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("person_documents").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[getPersonDocumentById]", { id, message: error.message });
    return null;
  }

  return (data as PersonDocument | null) ?? null;
}

// A first upload for a subject/document type — plain insert, protected by
// the check_subject trigger (rejects a subject_id that doesn't exist).
export async function createPersonDocument(input: {
  subjectType: PersonSubjectType;
  subjectId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  documentType: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  documentDate: string | null;
  uploadedBy: string;
  checksum: string | null;
}): Promise<{ document?: PersonDocument; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_documents")
    .insert({
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      original_filename: input.originalFilename,
      document_type: input.documentType,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      document_date: input.documentDate,
      uploaded_by: input.uploadedBy,
      checksum: input.checksum,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not create document: ${error?.message}` };
  }

  return { document: data as PersonDocument };
}

// Edits document_type/document_date while the linked evidence is still
// unverified. Not scoped by a WHERE clause on this table (person_documents
// has no verification_status of its own) — relies on the DB's
// check_verified_document_immutable trigger to reject the update if any
// verified/rejected evidence already references this document, surfacing
// that as a normal error string here. The caller (lib/actions/workforce.ts)
// is expected to have already confirmed the linked evidence is unverified
// before calling this, matching updateUnverifiedPersonEvidence()'s own gate.
export async function updateUnverifiedDocumentMetadata(input: {
  documentId: string;
  documentType?: string;
  documentDate?: string | null;
}): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const patch: Record<string, unknown> = {};
  if (input.documentType !== undefined) patch.document_type = input.documentType;
  if (input.documentDate !== undefined) patch.document_date = input.documentDate;

  if (Object.keys(patch).length === 0) return {};

  const { error } = await supabase.from("person_documents").update(patch).eq("id", input.documentId);

  if (error) {
    return { error: `Could not update document: ${error.message}` };
  }
  return {};
}

// Supersede: insert the replacement, then mark the old one superseded. Not
// wrapped in a single SQL transaction (Postgres has no cross-statement
// client-side transaction over the JS client without an RPC) — acceptable
// here because this is a rare, low-concurrency admin correction, not a
// hot path; a failure between the two steps leaves the new document
// active and the old one still active too, which is safe (never loses
// data) and visibly wrong (caught by "view upload history" review), never
// silently wrong.
export async function supersedePersonDocument(input: {
  oldDocumentId: string;
  subjectType: PersonSubjectType;
  subjectId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  documentType: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  documentDate: string | null;
  uploadedBy: string;
  checksum: string | null;
}): Promise<{ document?: PersonDocument; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("person_documents")
    .insert({
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      original_filename: input.originalFilename,
      document_type: input.documentType,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      document_date: input.documentDate,
      uploaded_by: input.uploadedBy,
      checksum: input.checksum,
      supersedes_document_id: input.oldDocumentId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not create superseding document: ${error?.message}` };
  }

  const { error: updateError } = await supabase
    .from("person_documents")
    .update({ status: "superseded" })
    .eq("id", input.oldDocumentId);

  if (updateError) {
    return { document: data as PersonDocument, error: `Document created but could not mark prior version superseded: ${updateError.message}` };
  }

  return { document: data as PersonDocument };
}
