// Pure, dependency-free document-upload validation — split out of
// storage.ts (which pulls in createServerClient()/the service-role
// client) specifically so it can be safely imported from a "use client"
// component to give an instant, honest error before a Save is even
// attempted, and to show the real limit beside a file picker. Importing
// storage.ts itself from client code would be unsafe (it imports the
// service-role Supabase client). No I/O here, easy to test independent
// of Supabase Storage — storage.ts re-exports both symbols so every
// existing server-side importer is unaffected.
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

// PDF-only for this first release, per the mission's explicit requirement.
export function validateDocumentFile(input: { size: number; type: string; name: string }): FileValidationResult {
  if (input.size === 0) {
    return { ok: false, error: "No file provided." };
  }
  if (input.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "File is too large. Maximum size is 10 MB." };
  }

  const ext = ("." + input.name.split(".").pop()).toLowerCase();
  const mimeOk = input.type === "application/pdf";
  const extOk = ext === ".pdf";

  if (!mimeOk || !extOk) {
    return { ok: false, error: "Please upload a PDF file." };
  }

  return { ok: true };
}
