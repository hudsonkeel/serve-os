// Vendor-neutral Serve OS scheduling domain types. AxisCare-specific field
// shapes stay inside lib/integrations/axiscare/ — nothing here imports
// from that folder. The rest of Serve OS should consume only these types
// and the functions in this folder, never raw AxisCare records.

export type ServeVisitStatus =
  | "scheduled"
  | "unassigned"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled"
  | "removed"
  | "unknown";

export type ServeCareModel =
  | "traditional_home_care"
  | "community_care"
  | "unknown";

// "confirmed" is reserved for an explicitly verified
// CARE_MODEL_BY_SERVICE_CODE mapping (see normalize.ts) — never set from
// inference (field presence, visit duration, etc.). Nothing in this
// codebase currently produces "confirmed"; the mapping table starts empty.
export type ProvenanceConfidence = "confirmed" | "inferred" | "unknown";

export interface ServePersonRef {
  externalId: string | null;
  displayName: string;
}

export interface ServeServiceRef {
  externalId: string | null;
  code: string | null;
  description: string | null;
  procedureCode: string | null;
}

export interface ServeModificationReason {
  id: string | null;
  name: string | null;
}

export interface ServeScheduleVisit {
  externalVisitId: string;
  sourceSystem: "axiscare";

  resident: ServePersonRef;
  // null means unassigned — no caregiver on this visit.
  caregiver: ServePersonRef | null;
  service: ServeServiceRef | null;

  // ISO 8601 UTC instants, normalized server-side — never a raw AxisCare
  // date/time string, never dependent on the rendering browser's
  // timezone. Empty string only if AxisCare provided no usable start/end
  // field at all (see normalize.ts).
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  // The visit's own AxisCare timezone when present (IANA name), for
  // display purposes only — scheduledStart/scheduledEnd/actualStart/
  // actualEnd are already normalized to UTC regardless of this value.
  timezone: string | null;

  visitType: string | null;
  status: ServeVisitStatus;

  assigned: boolean;
  verified: boolean;
  removed: boolean;

  modificationReason: ServeModificationReason | null;

  careModel: ServeCareModel;
  provenanceConfidence: ProvenanceConfidence;
}

// Optional recurring-plan context — not surfaced in Today's Schedule UI in
// this task. Field semantics are a live-observed best effort; see
// docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md for open questions
// (e.g. whether startTime/endTime are time-of-day strings or something
// richer — they are passed through as-is, not parsed as full timestamps,
// since a recurring schedule has no single calendar date for a time to
// resolve against).
export interface ServeRecurringSchedule {
  externalScheduleId: string;
  externalPlanId: string | null;
  sourceSystem: "axiscare";

  residentExternalId: string | null;
  residentDisplayName: string;

  caregiverExternalId: string | null;
  caregiverDisplayName: string | null;

  day: string | null;
  startTime: string;
  endTime: string;
  timezone: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  frequency: string | null;

  serviceCode: string | null;
  serviceDescription: string | null;
  careModel: ServeCareModel;
}

// Replaces an earlier total/assigned/unassigned/removed/... shape that
// counted every source record (including removed ones) into
// assigned/unassigned — a removed visit with no caregiver silently
// inflated "unassigned" as if it were actionable coverage. No UI consumed
// the old shape, so it was replaced outright rather than deprecated
// alongside it. See docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md's
// "Removed Visit Policy" for the full rationale.
//
// Every count below is explicit about whether it includes removed
// records:
// - sourceRecordCount: every normalized record, removed or not.
// - activeVisitCount + removedVisitCount === sourceRecordCount, always.
// - activeAssignedCount + activeUnassignedCount === activeVisitCount,
//   always — a removed visit is never counted as actionable unassigned
//   coverage, regardless of whether it has a caregiver.
// - scheduledCount/inProgressCount/completedCount/missedCount/
//   unknownCount describe ACTIVE visits only and sum to activeVisitCount
//   (removed visits are status 'removed', never any of these five, so
//   this holds by construction — see status.ts).
export interface ServeScheduleSummary {
  sourceRecordCount: number;
  activeVisitCount: number;
  removedVisitCount: number;

  activeAssignedCount: number;
  activeUnassignedCount: number;

  scheduledCount: number;
  inProgressCount: number;
  completedCount: number;
  missedCount: number;
  unknownCount: number;
}

// Aggregate-only diagnostic comparing AxisCare's scheduledStartDate/
// scheduledEndDate against startDate/endDate on Visit records — never a
// per-record or per-value result. Exists to validate (or correct) the
// "scheduledStartDate/scheduledEndDate is primary, startDate/endDate is
// fallback" choice documented in normalize.ts and
// docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md. See
// fieldPairAudit.ts.
export interface ServeTimeFieldAudit {
  recordsWithBothPairsPresent: number;
  recordsWithBothPairsParsed: number;
  recordsWithDifferingInstants: number;
  minAbsoluteDifferenceMinutes: number | null;
  maxAbsoluteDifferenceMinutes: number | null;
}

export type ServeTodaysScheduleUnavailableReason =
  // AXISCARE_SCHEDULE_ENABLED is not exactly "true" — a Serve OS release
  // decision, distinct from every reason below (all of which describe an
  // AxisCare-side or credential-side problem). No AxisCare request is
  // made and no credential-presence information is included when this
  // reason is returned — see lib/integrations/axiscare/config.ts's
  // isAxisCareScheduleEnabled() and todaysSchedule.ts.
  | "disabled"
  | "not_configured"
  | "authentication"
  | "authorization"
  | "timeout"
  | "upstream_unavailable"
  | "invalid_response"
  | "unknown";

export type ServeTodaysScheduleResult =
  | {
      available: true;
      sourceSystem: "axiscare";
      fetchedAt: string;
      operationalDate: string;
      // Every normalized record, including removed ones — never silently
      // discarded here, since they may matter later for audit/variance
      // analysis. Not the list a Today's Schedule UI should render.
      visits: ServeScheduleVisit[];
      // visits with status !== 'removed' — this is what a Today's
      // Schedule UI should default to rendering. A strict subset of
      // `visits`, in the same relative order.
      activeVisits: ServeScheduleVisit[];
      summary: ServeScheduleSummary;
      // Diagnostic only — not required for schedule display. See
      // ServeTimeFieldAudit and fieldPairAudit.ts.
      timeFieldAudit: ServeTimeFieldAudit;
      // hasNextPage = true means AxisCare's own pagination indicated more
      // data existed beyond what fetchBoundedPages() was willing to
      // fetch (see lib/integrations/axiscare/visits.ts's MAX_PAGES/
      // MAX_TOTAL_VISITS) — not that we chose not to ask.
      pagination: { hasNextPage: boolean };
    }
  | {
      available: false;
      sourceSystem: "axiscare";
      fetchedAt: string;
      operationalDate: string;
      reason: ServeTodaysScheduleUnavailableReason;
      safeMessage: string;
    };
