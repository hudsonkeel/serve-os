// AxisCare client -> Serve OS lifecycle mapping. Built from a real,
// read-only sample of 25 live AxisCare client records (Post-Release
// Stabilization, AxisCare Operational Synchronization, Workstream 2,
// Phase A) — not the previously untyped discovery stub's assumptions.
// See docs/architecture/AXISCARE_CLIENT_RECONCILIATION.md for the full
// investigation and dry-run report this mapping was derived from.
//
// Prospect detection (AxisCare Community Mapping + Operational State
// phase): now sourced from lifecycleSignals.ts's reviewed
// AXISCARE_LIFECYCLE_CLASS_MAP rather than a flat, Frisco-only set of
// exact strings — confirmed live that AxisCare client #40 (Firewheel)
// used "WAFirewheel Prospect", which the old Frisco-only
// PROSPECT_CLASS_CODES set never matched. The lifecycle SIGNAL is now
// independent of which community the class also happens to name (see
// communityMapping.ts for that separate, independent extraction).
import { hasProspectLifecycleSignal } from "./lifecycleSignals.ts";

export interface AxisCareClientStatus {
  readonly active: boolean;
  readonly label: string;
}

export interface AxisCareClientClass {
  readonly code: string;
  readonly label: string;
}

export type ServeClientLifecycle =
  | "active_client"
  | "inactive_client"
  | "prospect"
  | "needs_review";

export interface ClientLifecycleInput {
  readonly status: AxisCareClientStatus;
  readonly classes: readonly AxisCareClientClass[];
  readonly hasContactInfo: boolean;
  readonly hasStartDate: boolean;
}

// A start date that hasn't arrived yet is not evidence of "actually
// received service at some point" — it's the opposite: service hasn't
// begun. Comparing the raw YYYY-MM-DD strings directly (never parsed
// through a timezone-sensitive Date) is safe and sufficient for this
// format — lexicographic and chronological order agree. Callers must
// compute hasStartDate through this, never a bare `!!startDate`
// existence check — that was the actual defect (fixed 2026-08-23):
// AxisCare client #44 (Karen Mabry), status.active=false, a real start
// date of 2026-08-28 (nearly a week in the future, service not yet
// begun), was classified inactive_client — "a genuine former client" —
// purely because SOME start date value existed, with no thought to
// whether it had passed. That incorrectly made Discharge/Transfer
// applicable for someone who hadn't even started, let alone ended,
// service.
export function hasServiceStarted(startDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!startDate) return false;
  const today = now.toISOString().slice(0, 10);
  return startDate <= today;
}

export function classifyAxisCareClientLifecycle(input: ClientLifecycleInput): ServeClientLifecycle {
  if (input.status.active) {
    return "active_client";
  }

  if (hasProspectLifecycleSignal(input.classes.map((c) => c.code))) {
    return "prospect";
  }

  // Inactive, no prospect class, but real evidence of having actually
  // received service at some point (contact info on file and a start
  // date) — a genuine former client, not a placeholder/test row.
  if (input.hasContactInfo && input.hasStartDate) {
    return "inactive_client";
  }

  // Inactive, no prospect class, and no evidence of ever having actually
  // started service — ambiguous. Could be a legitimate thin record or a
  // synthetic/test AxisCare row (both were observed live — see the audit
  // doc). Never silently guessed.
  return "needs_review";
}
