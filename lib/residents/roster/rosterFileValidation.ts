// Pure, dependency-free roster-file validation — split out of
// rosterFileStorage.ts (which pulls in "server-only" + the service-role
// Supabase client) specifically so it can be safely imported from a
// "use client" component for an instant, honest error before upload is
// even attempted. Mirrors lib/workforce/documentValidation.ts's exact
// precedent and its own reasoning for the split.
export const MAX_ROSTER_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"];
const ALLOWED_MIME_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

export function validateRosterFile(input: { size: number; type: string; name: string }): FileValidationResult {
  if (input.size === 0) {
    return { ok: false, error: "No file provided." };
  }
  if (input.size > MAX_ROSTER_FILE_BYTES) {
    return { ok: false, error: "File is too large. Maximum size is 15 MB." };
  }

  const ext = ("." + input.name.split(".").pop()).toLowerCase();
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  // MIME type from the browser is not always reliable (a .csv can arrive
  // as "application/vnd.ms-excel" in some browsers) — extension is the
  // primary signal, MIME is an additional check only when present and
  // recognizable, never a sole blocker.
  const mimeOk = !input.type || ALLOWED_MIME_TYPES.includes(input.type) || input.type === "application/octet-stream";

  if (!extOk || !mimeOk) {
    return { ok: false, error: "Please upload a CSV or Excel (.xlsx) file." };
  }
  return { ok: true };
}
