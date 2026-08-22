// Community Roster Import + Reconciliation phase — file storage, mirroring
// lib/workforce/storage.ts's exact pattern: private bucket, UUID-based
// storage path, signed URLs only, never a public URL. See
// supabase/migrations/20260902280000_create_community_roster_imports_bucket.sql.
import "server-only";
import { createServerClient } from "../../supabase/server.ts";
export { MAX_ROSTER_FILE_BYTES, validateRosterFile, type FileValidationResult } from "./rosterFileValidation.ts";

export const COMMUNITY_ROSTER_IMPORTS_BUCKET = "community-roster-imports";
const SIGNED_URL_TTL_SECONDS = 60;

// {communityId}/{importRunId}/{sanitizedOriginalFilename} — the run id
// (not the filename alone) is what makes the path collision-free; the
// original filename is kept in the path for operator recognizability but
// also stored separately as roster_import_runs.source_filename metadata
// (matching person_documents.original_filename's convention).
export function buildRosterStoragePath(input: { communityId: string; importRunId: string; originalFilename: string }): string {
  const safeName = input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${input.communityId}/${input.importRunId}/${safeName}`;
}

export async function uploadRosterFileBytes(storagePath: string, bytes: ArrayBuffer, mimeType: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase.storage
    .from(COMMUNITY_ROSTER_IMPORTS_BUCKET)
    .upload(storagePath, bytes, { contentType: mimeType || "application/octet-stream", upsert: false });

  if (error) {
    return { error: `Could not upload roster file: ${error.message}` };
  }
  return {};
}

// Never a public URL — every read goes through a fresh, short-lived
// signed URL generated server-side, inside an already-authorized action.
export async function getSignedRosterFileUrl(storagePath: string): Promise<{ url?: string; error?: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(COMMUNITY_ROSTER_IMPORTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return { error: `Could not generate a link to the roster file: ${error?.message}` };
  }
  return { url: data.signedUrl };
}
