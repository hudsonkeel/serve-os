import type { WorkingNoteCategory } from "@/lib/supabase/types";

// Pure validation/normalization for Resident Working Notes. Kept separate
// from lib/actions/residentWorkingNotes.ts so it can be unit tested without
// a database — mirrors lib/residentCurrentNeeds/validation.ts.

export const WORKING_NOTE_MAX_LENGTH = 1000;

const WORKING_NOTE_CATEGORIES: readonly WorkingNoteCategory[] = [
  "operational",
  "family",
  "scheduling",
  "sales",
  "clinical",
  "general",
];

export interface NormalizeWorkingNoteResult {
  content?: string;
  error?: string;
}

export function normalizeWorkingNoteContent(
  raw: string
): NormalizeWorkingNoteResult {
  const content = raw.trim();

  if (!content) {
    return { error: "Working note cannot be blank." };
  }

  if (content.length > WORKING_NOTE_MAX_LENGTH) {
    return {
      error: `Keep working notes under ${WORKING_NOTE_MAX_LENGTH} characters.`,
    };
  }

  return { content };
}

// Empty string (the select's "no category" option) normalizes to null,
// matching how the column is stored (nullable, not an empty string).
export function normalizeWorkingNoteCategory(
  raw: string
): WorkingNoteCategory | null {
  if (!raw) return null;
  return WORKING_NOTE_CATEGORIES.includes(raw as WorkingNoteCategory)
    ? (raw as WorkingNoteCategory)
    : null;
}
