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

// Two ISO instants represent the "same" due date for editing purposes when
// they fall on the same calendar day — see isSameDueDateDay() below for
// why this must be day granularity, not exact-instant equality.
export function isSameDueDateDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

// A past due date is only rejected when it's a genuinely new *calendar
// day* choice — an unchanged due date that has simply passed since
// creation (the normal, expected state of an overdue follow-up) is never
// re-validated, so editing only the assignee on an already-overdue item
// doesn't require also pushing its date into the future.
//
// Both checks below compare at day granularity, not exact-instant
// equality/ordering — for two different reasons that happen to need the
// same fix:
//
// 1. "Unchanged" (isSameDueDateDay): the edit form's <input type="date">
//    only ever resubmits midnight UTC for whatever day it displays
//    (toDateInputValue() slices the date portion off the stored value).
//    A due date originally set with a real time-of-day component (by an
//    RPC, a script, or any path other than this exact form) would
//    otherwise never byte-for-byte match its own midnight-truncated
//    resubmission, making an untouched date look "newly chosen" and get
//    rejected just for editing some other field.
//
// 2. "Is it in the past" (the day-string comparison below): the same
//    midnight-truncation means "today," submitted via this form, is
//    almost always some hours *before* the current instant (now is
//    rarely exactly midnight) — comparing exact instants would make
//    "today" fail the past-date check on every edit made after midnight,
//    even though the business rule explicitly requires "today: allowed."
//    Comparing calendar-day strings (lexicographically — "YYYY-MM-DD" is
//    zero-padded, so string order matches chronological order) fixes
//    both problems the same way.
export function validateFollowUpDueDateNotPast(
  newIso: string | null,
  previousIso: string | null,
  now: Date = new Date()
): { error?: string } {
  if (!newIso) return {};
  if (isSameDueDateDay(newIso, previousIso)) return {};
  if (newIso.slice(0, 10) < now.toISOString().slice(0, 10)) {
    return { error: "Choose today or a future date when changing the due date." };
  }
  return {};
}

export function normalizeAssignedTo(raw: string | undefined): string | null {
  return raw?.trim() || null;
}
