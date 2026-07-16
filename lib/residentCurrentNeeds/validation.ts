// Pure validation/normalization for Resident Current Needs content.
// Kept separate from lib/actions/residentCurrentNeeds.ts so it can be unit
// tested without a database — mirrors lib/scheduling/status.ts.

export const RESIDENT_CURRENT_NEEDS_MAX_LENGTH = 1500;

export interface NormalizeResidentCurrentNeedsResult {
  content?: string;
  error?: string;
}

export function normalizeResidentCurrentNeedsContent(
  raw: string
): NormalizeResidentCurrentNeedsResult {
  const content = raw.trim();

  if (!content) {
    return { error: "Current needs cannot be blank." };
  }

  if (content.length > RESIDENT_CURRENT_NEEDS_MAX_LENGTH) {
    return {
      error: `Keep current needs under ${RESIDENT_CURRENT_NEEDS_MAX_LENGTH} characters.`,
    };
  }

  return { content };
}
