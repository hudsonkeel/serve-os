import type {
  WellnessFollowUpType,
  WellnessNotePriority,
} from "@/lib/supabase/types";

// Pure validation/normalization for editing an existing wellness follow-up.
// Kept separate from lib/actions/wellnessFollowUps.ts so it can be unit
// tested without a database — mirrors lib/residentCurrentNeeds/validation.ts
// and lib/residentWorkingNotes/validation.ts.

export const VALID_FOLLOW_UP_TYPES: readonly WellnessFollowUpType[] = [
  "reassessment",
  "resident_check_in",
  "family_update",
  "safety_review",
  "medication_review",
  "mobility_review",
  "equipment_review",
  "care_coordination",
  "service_review",
  "documentation",
  "other",
];

export const VALID_PRIORITIES: readonly WellnessNotePriority[] = [
  "routine",
  "monitor",
  "important",
  "urgent",
];

export function isValidFollowUpType(
  value: string
): value is WellnessFollowUpType {
  return (VALID_FOLLOW_UP_TYPES as readonly string[]).includes(value);
}

export function isValidPriority(value: string): value is WellnessNotePriority {
  return (VALID_PRIORITIES as readonly string[]).includes(value);
}

export interface NormalizeFollowUpTitleResult {
  title?: string;
  error?: string;
}

export function normalizeFollowUpTitle(raw: string): NormalizeFollowUpTitleResult {
  const title = raw.trim();
  if (!title) {
    return { error: "Enter a title for this follow-up." };
  }
  return { title };
}

export interface ParseDueDateResult {
  // undefined = no error and no date supplied (cleared/omitted); a present
  // `iso` means a valid date was parsed.
  iso?: string | null;
  error?: string;
}

export function parseFollowUpDueDate(raw: string | undefined): ParseDueDateResult {
  if (!raw) {
    return { iso: null };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Enter a valid due date." };
  }

  return { iso: parsed.toISOString() };
}

// A past due date is only rejected when it's a genuinely new choice — an
// unchanged due date that has simply passed since creation (the normal,
// expected state of an overdue follow-up) is never re-validated, so
// editing only the assignee on an already-overdue item doesn't require
// also pushing its date into the future.
export function validateFollowUpDueDateNotPast(
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

export function normalizeAssignedTo(raw: string | undefined): string | null {
  return raw?.trim() || null;
}
