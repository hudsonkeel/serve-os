// AxisCare client -> Serve OS lifecycle mapping. Built from a real,
// read-only sample of 25 live AxisCare client records (Post-Release
// Stabilization, AxisCare Operational Synchronization, Workstream 2,
// Phase A) — not the previously untyped discovery stub's assumptions.
// See docs/architecture/AXISCARE_CLIENT_RECONCILIATION.md for the full
// investigation and dry-run report this mapping was derived from.
//
// Prospect/inactive-client detection (AxisCare Community Mapping +
// Operational State phase, extended by the Frisco Needs Review
// investigation, 2026-08-23): sourced from lifecycleSignals.ts's
// reviewed AXISCARE_LIFECYCLE_CLASS_MAP rather than a flat, Frisco-only
// set of exact strings — confirmed live that AxisCare client #40
// (Firewheel) used "WAFirewheel Prospect", which the old Frisco-only
// PROSPECT_CLASS_CODES set never matched. The lifecycle SIGNAL is now
// independent of which community the class also happens to name (see
// communityMapping.ts for that separate, independent extraction).
//
// IMPORTANT — "inactive_client" does NOT mean "former client" or
// "discharged." Confirmed business semantics (Frisco Needs Review
// investigation, 2026-08-23):
//   active_client    = established client currently activated for
//                       service/visits.
//   inactive_client  = established client — the relationship/agreement
//                       is already in place — currently without
//                       scheduled/current service activity. Serve
//                       deliberately keeps a client Inactive in AxisCare
//                       until they actually request service (activating
//                       a client in AxisCare has a real cost), so a
//                       client can legitimately become inactive_client
//                       before ever receiving a single visit. Never
//                       assume prior service occurred; never assume it
//                       didn't — inactive_client asserts neither.
//   prospect         = has not yet crossed the established-client
//                       threshold (no agreement/relationship in place
//                       yet).
//   needs_review     = current evidence genuinely cannot establish which
//                       bucket applies.
// Discharge/Transfer is a separate event/state — inactive_client alone
// is never sufficient to conclude a discharge occurred (see
// clientReadinessReadiness.ts's evaluateDischarge() for how that
// distinction is enforced downstream).
//
// A resident can reach inactive_client as a standby client through TWO
// paths, not just the AxisCare class signal above:
//   1. getAxisCareLifecycleSignal(classes) === 'inactive_client' — an
//      explicit, reviewed AxisCare class code (e.g. "WAFrisco - Active No
//      Visits").
//   2. A governed resident_serve_relationship_corrections row whose
//      rationale carries this exact marker — for a resident whose
//      AxisCare class signal isn't explicit enough on its own, but whose
//      standby status was confirmed by a human through the existing
//      correction mechanism (never a fabricated class mapping; see
//      scripts/apply-frisco-standby-inactive-clarification.ts for the
//      one place this has been used, and
//      docs/architecture/AXISCARE_CLIENT_RECONCILIATION.md for why free
//      text alone is otherwise never a reliable machine-readable
//      signal). Exact substring match only, same discipline as
//      lib/relationships/testMarker.ts's __SERVE_TEST__ convention —
//      never inferred from rationale wording.
import { getAxisCareLifecycleSignal } from "./lifecycleSignals.ts";

export const STANDBY_INACTIVE_CORRECTION_MARKER = "[Serve standby — not a discharge/transfer]";

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

// A start date that hasn't arrived yet is not evidence that service has
// actually begun — it's the opposite: service hasn't started yet.
// Comparing the raw YYYY-MM-DD strings directly (never parsed through a
// timezone-sensitive Date) is safe and sufficient for this format —
// lexicographic and chronological order agree. Callers must compute
// hasStartDate through this, never a bare `!!startDate` existence check
// — that was the actual defect (fixed 2026-08-23): AxisCare client #44
// (Karen Mabry), status.active=false, a real start date of 2026-08-28
// (nearly a week in the future, service not yet begun), was classified
// inactive_client purely because SOME start date value existed, with no
// thought to whether it had passed. That incorrectly made
// Discharge/Transfer applicable for someone whose service hadn't even
// started.
//
// This is only ONE of the two ways a record can reach inactive_client —
// see classifyAxisCareClientLifecycle() below. It is not, and was never
// meant to be, the only evidence of "established client" status; a
// reviewed class-code signal (AXISCARE_LIFECYCLE_CLASS_MAP) can also
// establish inactive_client directly, with no start date required at
// all (a standby client who hasn't been served yet).
export function hasServiceStarted(startDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!startDate) return false;
  const today = now.toISOString().slice(0, 10);
  return startDate <= today;
}

export function classifyAxisCareClientLifecycle(input: ClientLifecycleInput): ServeClientLifecycle {
  if (input.status.active) {
    return "active_client";
  }

  // A reviewed class code is the most direct, explicit signal available
  // — checked before the start-date fallback below, and (for
  // "inactive_client") deliberately does NOT require hasStartDate: an
  // established standby client (agreement/relationship already in
  // place, deliberately kept Inactive in AxisCare until service is
  // requested) can be correctly inactive_client with no start date at
  // all. See lifecycleSignals.ts's header for the confirmed business
  // meaning this encodes.
  const classSignal = getAxisCareLifecycleSignal(input.classes.map((c) => c.code));
  if (classSignal === "prospect") {
    return "prospect";
  }
  if (classSignal === "inactive_client") {
    return "inactive_client";
  }

  // No explicit class signal either way. Fall back to date-based
  // evidence: contact info on file and a start date that has actually
  // passed is real, if less direct, evidence of an established client
  // relationship.
  if (input.hasContactInfo && input.hasStartDate) {
    return "inactive_client";
  }

  // No class signal, no start-date evidence — ambiguous. Could be a
  // legitimate thin record, an established standby client whose start
  // date was simply never recorded, or a synthetic/test AxisCare row
  // (all observed live — see the audit doc). Never silently guessed.
  return "needs_review";
}
