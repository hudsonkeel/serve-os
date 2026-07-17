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
//
// "Unchanged" is judged at day granularity, not exact-instant equality:
// the <input type="date"> this feeds only ever collects a calendar date
// (no time-of-day), so it always resubmits midnight UTC for that day.
// A due date originally set with a time-of-day component (e.g. via a
// touch/RPC call, not this same form) would otherwise never
// byte-for-byte equal its own round-trip through this input, making an
// untouched overdue action's date look "newly chosen" and get rejected
// just for editing some other field (title, assignee, priority...).
export function validateDueDateNotPast(
  newIso: string | null,
  previousIso: string | null,
  now: Date = new Date()
): { error?: string } {
  if (!newIso) return {};
  if (previousIso && newIso.slice(0, 10) === previousIso.slice(0, 10)) return {};
  if (new Date(newIso).getTime() < now.getTime()) {
    return { error: "Choose a due date that isn't in the past." };
  }
  return {};
}

export function normalizeOptionalText(raw: string | undefined): string | null {
  return raw?.trim() || null;
}

// ─── Service Opportunity (Part 10) ──────────────────────────────────────

export interface ParseIntegerResult {
  value?: number | null;
  error?: string;
}

// Shared by visits-per-week (0-21: zero is a valid "not yet scheduled but
// planned" value, 21 is a generous daily-visit ceiling) and estimated
// visit duration (1-1440 minutes: must be positive, capped at one day) —
// callers pass the field's own bounds and label.
export function parseOptionalBoundedInteger(
  raw: string | undefined,
  min: number,
  max: number,
  label: string
): ParseIntegerResult {
  if (raw === undefined || raw.trim() === "") {
    return { value: null };
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return { error: `Enter a whole number for ${label}.` };
  }
  if (parsed < min || parsed > max) {
    return { error: `${label} must be between ${min} and ${max}.` };
  }
  return { value: parsed };
}

// anticipated_start_date is a plain `date` column (no time component) —
// validated the same way parseOptionalDate validates a timestamp, but
// returns a YYYY-MM-DD string rather than a full ISO instant.
export function parseOptionalDateOnly(raw: string | undefined): ParseDateResult {
  if (!raw) {
    return { iso: null };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Enter a valid date." };
  }
  return { iso: raw };
}
