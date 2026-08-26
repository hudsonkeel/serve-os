// Pure validation/normalization for QAPI Domain Note content. Kept separate
// from lib/actions/qapiDomainNotes.ts so it can be unit tested without a
// database — mirrors lib/residentCurrentNeeds/validation.ts exactly, with a
// shorter cap matching the migration's own check constraint (1000, not
// resident_current_needs' 1500 — this is meant to stay a concise leadership
// note, not a full care summary).

export const QAPI_DOMAIN_NOTE_MAX_LENGTH = 1000;

export interface NormalizeQapiDomainNoteResult {
  content?: string;
  error?: string;
}

export function normalizeQapiDomainNoteContent(raw: string): NormalizeQapiDomainNoteResult {
  const content = raw.trim();

  if (!content) {
    return { error: "The note cannot be blank." };
  }

  if (content.length > QAPI_DOMAIN_NOTE_MAX_LENGTH) {
    return {
      error: `Keep this note under ${QAPI_DOMAIN_NOTE_MAX_LENGTH} characters.`,
    };
  }

  return { content };
}
