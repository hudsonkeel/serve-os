// Document storage for the platform-owned person_documents table — private
// bucket, UUID storage filenames, short-lived signed URLs only. See
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql
// ("person-documents" bucket, public = false).
//
// No private-bucket/signed-URL precedent existed anywhere in this repo
// before this file — the one prior bucket (recruiting-resumes, see
// lib/actions/recruiting.ts) is public. This introduces that pattern for
// the first time.
import { createServerClient } from "../supabase/server.ts";
import type { PersonSubjectType } from "../supabase/types.ts";

export const PERSON_DOCUMENTS_BUCKET = "person-documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_TTL_SECONDS = 60;

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

// PDF-only for this first release, per the mission's explicit requirement.
// Pure — no I/O, easy to test independent of Supabase Storage.
export function validateDocumentFile(input: { size: number; type: string; name: string }): FileValidationResult {
  if (input.size === 0) {
    return { ok: false, error: "No file provided." };
  }
  if (input.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "File size must be under 10 MB." };
  }

  const ext = ("." + input.name.split(".").pop()).toLowerCase();
  const mimeOk = input.type === "application/pdf";
  const extOk = ext === ".pdf";

  if (!mimeOk || !extOk) {
    return { ok: false, error: "Please upload a PDF file." };
  }

  return { ok: true };
}

// {subjectType}/{subjectId}/{documentType}/{documentId}.pdf — the original
// filename is never part of the storage path; it's stored only as
// person_documents.original_filename metadata.
export function buildDocumentStoragePath(input: {
  subjectType: PersonSubjectType;
  subjectId: string;
  documentType: string;
  documentId: string;
}): string {
  const safeDocumentType = input.documentType.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${input.subjectType}/${input.subjectId}/${safeDocumentType}/${input.documentId}.pdf`;
}

export async function uploadDocumentBytes(
  storagePath: string,
  bytes: ArrayBuffer
): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.storage.from(PERSON_DOCUMENTS_BUCKET).upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (error) {
    return { error: `Could not upload document: ${error.message}` };
  }
  return {};
}

// Only ever called after delete_unverified_evidence_and_document() has
// already removed the DB rows — see lib/actions/workforce.ts's
// deleteAccidentalWorkforceUpload(). A storage failure here is logged but
// deliberately non-fatal to the caller: the DB rows (the source of truth
// for whether this evidence exists) are already gone, and an orphaned file
// in a private bucket is a cheap, safe failure mode compared to leaving a
// deleted evidence record's file "still there."
export async function deleteDocumentBytes(storagePath: string): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.storage.from(PERSON_DOCUMENTS_BUCKET).remove([storagePath]);

  if (error) {
    return { error: `Could not delete document file: ${error.message}` };
  }
  return {};
}

// Never a public URL — every read goes through a fresh, short-lived signed
// URL generated server-side, inside an already-authorized server action.
export async function getSignedDocumentUrl(storagePath: string): Promise<{ url?: string; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase.storage
    .from(PERSON_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return { error: `Could not generate document access link: ${error?.message}` };
  }
  return { url: data.signedUrl };
}
