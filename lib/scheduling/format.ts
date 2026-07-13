// Pure, vendor-neutral display formatting for ServeScheduleVisit /
// ServeTodaysScheduleResult data. No network access, no AxisCare-specific
// imports — operates only on the normalized Serve scheduling types so it
// can be shared by any future schedule UI, not just Workspace.

import type {
  ServeScheduleVisit,
  ServeTodaysScheduleUnavailableReason,
  ServeVisitStatus,
} from "./types.ts";
import { DEFAULT_TIMEZONE } from "./dateTime.ts";

// Copy per Part K — deliberately generic, never derived from a raw
// AxisCareError message, so a vendor error string can never reach the
// page even indirectly. Shared here (rather than living inline in
// ScheduleUnavailableState.tsx) so it stays covered by this folder's
// plain-Node test convention.
export const UNAVAILABLE_SCHEDULE_COPY: Record<
  ServeTodaysScheduleUnavailableReason,
  string
> = {
  // Deliberately not "not configured"/"unavailable" language — a
  // feature-disabled Workspace is an intentional release-control state,
  // not a problem. See ScheduleUnavailableState.tsx, which also gives
  // "disabled" its own supporting copy and omits the "try reloading"
  // suggestion the other reasons use.
  disabled: "Schedule managed in AxisCare",
  not_configured: "AxisCare scheduling is not configured.",
  authentication: "Serve OS could not authenticate with AxisCare.",
  authorization: "AxisCare did not authorize this schedule request.",
  timeout: "Today's live schedule could not be loaded.",
  upstream_unavailable: "Today's live schedule could not be loaded.",
  invalid_response:
    "AxisCare returned schedule data Serve OS could not safely interpret.",
  unknown:
    "AxisCare returned schedule data Serve OS could not safely interpret.",
};

export const STATUS_LABELS: Record<ServeVisitStatus, string> = {
  scheduled: "Scheduled",
  unassigned: "Unassigned",
  in_progress: "In Progress",
  completed: "Completed",
  missed: "Missed",
  cancelled: "Cancelled",
  removed: "Removed",
  unknown: "Status Unknown",
};

// Badge tones (see components/ui/Badge.tsx) — restrained on purpose per
// the Today's Schedule visual design guidance: unassigned reads as the
// one status that needs attention, everything else stays calm.
export const STATUS_BADGE_TONE: Record<ServeVisitStatus, "neutral" | "gold" | "blue" | "warning" | "danger" | "success" | "imported"> = {
  scheduled: "neutral",
  unassigned: "warning",
  in_progress: "blue",
  completed: "success",
  missed: "warning",
  cancelled: "neutral",
  removed: "neutral",
  unknown: "neutral",
};

function formatClockTime(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

// AxisCare's own reported timezone counts as "the standard operational
// timezone" whenever it resolves to Central — "US/Central" is the live,
// confirmed value (a legacy IANA alias for America/Chicago). Only a visit
// whose timezone is present AND resolves to something other than Central
// should surface a zone note; everything else stays implicit, matching
// Part I's "show timezone only when it differs ... or ambiguity exists."
const CENTRAL_ALIASES = new Set(["America/Chicago", "US/Central"]);

function isNonCentralZone(timeZone: string | null): boolean {
  if (!timeZone) return false;
  if (CENTRAL_ALIASES.has(timeZone)) return false;
  // Resolve to an offset-bearing "short" zone name (e.g. "CDT", "EDT") so
  // two different IANA names that happen to mean the same wall-clock zone
  // don't falsely show a note.
  try {
    const shortZone = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    const centralShortZone = new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_TIMEZONE,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return shortZone !== centralShortZone;
  } catch {
    return false;
  }
}

export interface VisitTimeDisplay {
  range: string;
  zoneNote: string | null;
}

// Formats scheduledStart/scheduledEnd (already-normalized UTC ISO
// instants — see types.ts) as a readable local time range, e.g.
// "8:00 AM–10:00 AM". Falls back to the visit's own timezone when
// present, otherwise America/Chicago — never the rendering browser's
// implicit local timezone. Returns "Time unavailable" for the range when
// either instant failed to parse upstream (empty string per types.ts).
export function formatVisitTimeRange(
  scheduledStart: string,
  scheduledEnd: string,
  timezone: string | null
): VisitTimeDisplay {
  const zone = timezone ?? DEFAULT_TIMEZONE;
  const start = scheduledStart ? formatClockTime(scheduledStart, zone) : null;
  const end = scheduledEnd ? formatClockTime(scheduledEnd, zone) : null;

  if (!start || !end) {
    return { range: "Time unavailable", zoneNote: null };
  }

  return {
    range: `${start}–${end}`,
    zoneNote: isNonCentralZone(timezone) ? timezone : null,
  };
}

// "Updated 9:42 AM" — always rendered in the operational timezone
// (America/Chicago), never raw UTC, per Part D.
export function formatUpdatedAt(fetchedAtIso: string): string {
  const date = new Date(fetchedAtIso);
  if (Number.isNaN(date.getTime())) return "Updated time unavailable";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `Updated ${time} CT`;
}

// Chronological ordering for the "Today's Visits" list (Part G). Visits
// with an unparseable scheduledStart (empty string, per types.ts) sort
// last rather than first — an ISO string compares correctly against
// another ISO string, but "" would otherwise sort before every real time.
export function sortVisitsByScheduledStart(
  visits: ServeScheduleVisit[]
): ServeScheduleVisit[] {
  return [...visits].sort((a, b) => {
    if (!a.scheduledStart && !b.scheduledStart) return 0;
    if (!a.scheduledStart) return 1;
    if (!b.scheduledStart) return -1;
    return a.scheduledStart < b.scheduledStart ? -1 : a.scheduledStart > b.scheduledStart ? 1 : 0;
  });
}
