import type { ServeVisitStatus } from "./types.ts";

export interface VisitStatusInput {
  removed: boolean;
  hasCaregiver: boolean;
  clockInTime: string | null;
  clockOutTime: string | null;
}

// Deterministic visit-status mapping. Every rule below is driven by an
// explicit, live-observed AxisCare field — never by comparing against the
// current wall-clock time, and never by guessing at an unconfirmed value
// (e.g. a specific `type` or `modificationReason.name` string meaning
// "cancelled"). Unknown is preferable to an unsupported guess.
//
// Rule order (first match wins):
//
// 1. removed === true                              -> "removed"
//    The strongest, most explicit AxisCare signal available.
//
// 2. clock activity recorded but no caregiver on
//    record (contradictory/anomalous data)          -> "unknown"
//    A visit can't realistically be clocked into without an assigned
//    caregiver. Rather than guess which signal to trust, this is reported
//    as unknown so it surfaces for human review instead of being silently
//    misclassified as either "in_progress"/"completed" or "unassigned".
//
// 3. clockOut.time exists                           -> "completed"
//    The strongest completion signal available.
//
// 4. clockIn.time exists, clockOut.time does not     -> "in_progress"
//
// 5. no caregiver assigned, visit hasn't started     -> "unassigned"
//
// 6. otherwise (assigned, not started, not removed)  -> "scheduled"
//
// NOT IMPLEMENTED (deliberately):
// - "cancelled": would require a confirmed AxisCare value for `type` or
//   `modificationReason.name` that means "cancelled." No such value has
//   been observed live or documented. Guessing a string match risks a
//   worse outcome than "unknown"/"scheduled".
// - "missed": explicitly out of scope for this rule set per the task that
//   introduced it — inferring "missed" from wall-clock time alone
//   ("current time is after scheduled end, no clock-in") is exactly the
//   pattern this function must not implement. This is reserved as a
//   future *exception* rule in Community Intelligence / Scheduling
//   Intelligence, not baked into status normalization — see
//   docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md.
export function determineVisitStatus(input: VisitStatusInput): ServeVisitStatus {
  if (input.removed) return "removed";

  const hasClockActivity = Boolean(input.clockInTime || input.clockOutTime);
  if (hasClockActivity && !input.hasCaregiver) return "unknown";

  if (input.clockOutTime) return "completed";
  if (input.clockInTime) return "in_progress";
  if (!input.hasCaregiver) return "unassigned";

  return "scheduled";
}
