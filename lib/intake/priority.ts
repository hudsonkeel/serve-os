import type { RelationshipPriority } from "@/lib/supabase/types";

// Deterministic priority + due-date rules — see docs/design/
// SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Priority rules." Central time
// throughout (this app's one established operating timezone — see
// lib/utils/date.ts). "Business day" = Mon-Fri Central; weekend
// submissions and after-hours submissions both roll forward to the next
// business day rather than same-day, regardless of urgency — a 2am or
// Saturday "ASAP" inquiry still gets a same-business-day-equivalent
// response, but that response window doesn't start until staff are
// actually working.

const BUSINESS_HOURS_CUTOFF_HOUR_CENTRAL = 17; // 5:00 PM Central

export type IntakeTimingCategory = "immediate" | "within_days" | "planning_ahead" | "unknown";

// The current website form does not yet collect a distinct timing field
// (see docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md's field-mapping
// inventory) — this categorizer exists so the rule is ready the moment it
// does, and so lib/actions/intake.ts's own `startTiming` values
// ("immediately", "coming_weeks", etc.) can eventually share it.
export function categorizeTiming(rawTiming: string | null): IntakeTimingCategory {
  const value = rawTiming?.trim().toLowerCase() ?? "";
  if (!value) return "unknown";
  if (/(immediate|asap|urgent|right away|as soon as possible)/.test(value)) return "immediate";
  if (/(few days|this week|coming days|soon)/.test(value)) return "within_days";
  if (/(coming weeks|planning|future|not sure|exploring|later)/.test(value)) return "planning_ahead";
  return "unknown";
}

export interface PriorityRuleResult {
  priority: RelationshipPriority;
  // Central-timezone calendar date (YYYY-MM-DD) the first action is due —
  // callers convert to a due_at timestamp (midnight UTC of this date),
  // matching every other date-only due-date field in this app.
  dueDateCentral: string;
  isSameBusinessDay: boolean;
}

function centralCalendarParts(date: Date): { year: number; month: number; day: number; weekday: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday],
    hour: Number(parts.hour),
  };
}

function centralDateString(year: number, month: number, day: number): string {
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return asUtc.toISOString().slice(0, 10);
}

function isBusinessDay(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

// Returns the calendar date `daysAhead` business days after `today`
// (daysAhead=0 means "today, if today is a business day; otherwise the
// next business day").
function businessDayCentral(now: Date, daysAhead: number): { year: number; month: number; day: number } {
  const { year, month, day, weekday } = centralCalendarParts(now);
  let cursor = new Date(Date.UTC(year, month - 1, day));
  let remaining = daysAhead;
  let cursorWeekday = weekday;

  // Roll onto a business day first if today isn't one.
  while (!isBusinessDay(cursorWeekday)) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    cursorWeekday = cursor.getUTCDay();
  }

  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    cursorWeekday = cursor.getUTCDay();
    if (isBusinessDay(cursorWeekday)) remaining -= 1;
  }

  return { year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate() };
}

export function determinePriorityRule(
  timingCategory: IntakeTimingCategory,
  now: Date = new Date()
): PriorityRuleResult {
  const { weekday, hour } = centralCalendarParts(now);
  const todayIsBusinessDay = isBusinessDay(weekday);
  const withinBusinessHours = todayIsBusinessDay && hour < BUSINESS_HOURS_CUTOFF_HOUR_CENTRAL;

  if (timingCategory === "immediate") {
    // A weekend submission has no "same day" to compare against at all —
    // daysAhead=0 in that case simply resolves to the coming Monday via
    // businessDayCentral's own roll-forward, the same as if "today" were
    // already Monday. Only a business-day submission after the cutoff
    // hour needs the explicit +1 (next business day beyond today).
    const daysAhead = todayIsBusinessDay ? (withinBusinessHours ? 0 : 1) : 0;
    const target = businessDayCentral(now, daysAhead);
    return {
      priority: "urgent",
      dueDateCentral: centralDateString(target.year, target.month, target.day),
      isSameBusinessDay: withinBusinessHours,
    };
  }

  if (timingCategory === "within_days") {
    const target = businessDayCentral(now, 1);
    return { priority: "high", dueDateCentral: centralDateString(target.year, target.month, target.day), isSameBusinessDay: false };
  }

  // planning_ahead and unknown both get a prompt, normal-priority
  // check-in — "planning ahead" isn't urgent, but "unknown" shouldn't be
  // read as low-priority either (see Part 19: unknown timing still gets
  // a "Clarify needs and timing" action, not silence).
  const target = businessDayCentral(now, 1);
  return { priority: "normal", dueDateCentral: centralDateString(target.year, target.month, target.day), isSameBusinessDay: false };
}
