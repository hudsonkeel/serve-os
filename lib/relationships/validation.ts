// Pure validation/normalization for Relationships, Touches, Actions, and
// Working Notes. Kept separate from lib/actions/relationships.ts so it can
// be unit tested without a database — mirrors
// lib/residentCurrentNeeds/validation.ts and
// lib/wellnessFollowUps/validation.ts.

export interface NormalizeTextResult {
  value?: string;
  error?: string;
}

export function normalizeDisplayName(raw: string): NormalizeTextResult {
  const value = raw.trim();
  if (!value) {
    return { error: "Enter a name for this relationship." };
  }
  return { value };
}

export function normalizeActionTitle(raw: string): NormalizeTextResult {
  const value = raw.trim();
  if (!value) {
    return { error: "Enter a title for this action." };
  }
  return { value };
}

export function normalizeTouchSummary(raw: string): NormalizeTextResult {
  const value = raw.trim();
  if (!value) {
    return { error: "Describe what happened in this touch." };
  }
  return { value };
}

export interface ParseDateResult {
  iso?: string | null;
  error?: string;
}

export function parseOptionalDate(raw: string | undefined): ParseDateResult {
  if (!raw) {
    return { iso: null };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Enter a valid date." };
  }
  return { iso: parsed.toISOString() };
}

// A newly-chosen past due date is rejected; an unchanged one that has
// simply passed since creation is not re-validated — matches
// lib/wellnessFollowUps/validation.ts's validateFollowUpDueDateNotPast.
export function validateDueDateNotPast(
  newIso: string | null,
  previousIso: string | null,
  now: Date = new Date()
): { error?: string } {
  if (!newIso) return {};
  if (newIso === previousIso) return {};
  if (new Date(newIso).getTime() < now.getTime()) {
    return { error: "Choose a due date that isn't in the past." };
  }
  return {};
}

export function normalizeOptionalText(raw: string | undefined): string | null {
  return raw?.trim() || null;
}
