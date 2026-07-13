// Server-side, timezone-aware date/time normalization for AxisCare
// schedule/visit data. Pure functions, no network/token access — not
// server-only, and deliberately not vendor-specific (works on any raw
// date/time string + IANA timezone), even though its only caller today is
// the AxisCare normalization layer.
//
// LIVE-FIELD AMBIGUITY: the exact wire format of AxisCare's
// scheduledStartDate/scheduledEndDate/clockIn.time/clockOut.time fields
// was not observed with real values in live discovery (discovery only
// ever reports field *names*, never values, per this integration's PHI
// policy). This module handles the two plausible formats defensively:
// (1) a string with an explicit UTC/offset marker ("Z" or "+HH:MM"), used
// as-is; (2) a naive "wall clock" string with no offset, interpreted as
// local time in the given IANA timezone. If AxisCare's real format is
// neither, parsing returns null rather than silently producing a wrong
// instant — see the "Date/Time Behavior" section of
// docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md.

const DEFAULT_TIMEZONE = "America/Chicago";

const HAS_EXPLICIT_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

// Computes the offset (in minutes) to ADD to a UTC timestamp to get the
// wall-clock time in `timeZone` at the instant `date` represents. Mirrors
// lib/utils/date.ts's centralOffsetMinutes, generalized to any IANA zone
// — a visit's own `timezone` field takes precedence over the Central Time
// fallback, so this can't be hardcoded to Central the way the existing
// helper is.
function offsetMinutesForZone(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return Math.round((asUtc - date.getTime()) / 60_000);
}

// Interprets a naive "YYYY-MM-DDTHH:MM[:SS]" string (no offset) as
// wall-clock time IN `timeZone`, and returns the true UTC instant.
// Deliberately does NOT use `new Date(naiveString)` — that would apply
// the *running process's* local timezone (a classic bug this function
// exists specifically to avoid; see AGENTS.md-adjacent guidance on
// avoiding local-browser/server timezone behavior).
export function parseWallClockInZone(naive: string, timeZone: string): Date | null {
  const match = NAIVE_DATETIME.exec(naive.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;

  // Step 1: read the wall-clock numbers as if they were UTC. This instant
  // is not correct yet, but its calendar date is right, which is enough
  // to look up the correct DST rule for `timeZone` on that date.
  const approxUtcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0")
  );

  // Step 2: find the real offset for that calendar date, then apply it to
  // get the true UTC instant. (Known limitation: a naive time that falls
  // exactly within a DST "spring forward" gap or "fall back" overlap is
  // inherently ambiguous — this resolves it using the offset in effect at
  // the approximate instant, the same approach used by
  // lib/utils/date.ts's existing getCentralDayBoundaryUtc.)
  const offsetMinutes = offsetMinutesForZone(new Date(approxUtcMs), timeZone);
  return new Date(approxUtcMs - offsetMinutes * 60_000);
}

// Normalizes any AxisCare date/time string (offset-bearing or naive) to a
// UTC ISO 8601 string, or null if the value is missing/unparseable.
// `timeZone` should be the visit's own `timezone` field when present,
// falling back to DEFAULT_TIMEZONE (America/Chicago) — see normalize.ts.
export function parseAxisCareDateTime(
  raw: string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (HAS_EXPLICIT_OFFSET.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = parseWallClockInZone(trimmed, timeZone);
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

export { DEFAULT_TIMEZONE };
