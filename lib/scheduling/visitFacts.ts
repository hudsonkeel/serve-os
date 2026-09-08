// Normalizes an already-normalized ServeScheduleVisit (see normalize.ts)
// plus resolved canonical identity into a HistoricalFactInput — the
// scheduling domain's contribution to the shared Historical Fact
// foundation (lib/intelligence/persistence/historicalFacts.ts). Pure,
// deterministic, no database/network access: the ingestion orchestrator
// (visitFactsSync.ts) is the only caller and does all I/O itself.
//
// Fact type deliberately named "scheduling.visit_recorded", not
// "scheduling.visit_completed" as the architecture proposal's placeholder
// suggested — a single Visit's natural-key stream must keep the same
// fact_type across its whole lifecycle (scheduled -> in_progress ->
// completed, or scheduled -> removed) for dedup/supersession to work
// correctly; "completed" would be wrong for every non-completed status.
// The actual ServeVisitStatus lives in the payload instead. See
// docs/intelligence/SERVE_FINANCIAL_INTELLIGENCE_V0.1_ARCHITECTURE_AND_API_DISCOVERY.md
// §4 point 4 for why this Fact is scheduling-owned, not financial-owned.
import type { ServeScheduleVisit } from "./types.ts";
import type { AxisCareRawVisit } from "../integrations/axiscare/types.ts";
import type { HistoricalFactInput } from "../intelligence/persistence/historicalFacts.ts";

export const VISIT_FACT_DOMAIN = "scheduling";
export const VISIT_FACT_TYPE = "scheduling.visit_recorded";

// Identity resolved against Serve's own canonical stores before a Visit
// can become a Fact — never derived here, always looked up by the caller
// (visitFactsSync.ts) via the existing AxisCare client/caregiver identity-
// matching pipelines. See getResidentMatchesByAxisCareClientIds()
// (lib/data/axiscareOperationalState.ts) and
// getPersonVendorIdentityLinksByVendorRecordIds() (lib/data/personVendorIdentityLinks.ts).
export interface VisitFactResolution {
  // Canonical residents.id. Required — see buildVisitHistoricalFact()'s
  // "unresolved_resident_identity" skip reason for what happens without it.
  readonly residentId: string | null;
  // Resolved Community per Business Ontology §51 (economic attribution
  // follows service context, i.e. the CLIENT's resolved Community — never
  // the caregiver's home/default Community). Null is a legitimate,
  // preserved state (a genuinely non-Community client), not an error.
  readonly communityId: string | null;
  // Canonical workforce_members.id, if the caregiver's AxisCare identity
  // has been matched. Null when unassigned or not yet identity-matched —
  // the Fact is still created; the caregiver dimension is simply
  // unavailable for that Visit until a later re-ingestion run observes a
  // resolved match (re-ingestion is idempotent, so this self-heals).
  readonly caregiverWorkforceMemberId: string | null;
}

export type VisitFactSkipReason = "unresolved_resident_identity" | "no_usable_occurrence_time";

export interface VisitFactSkipped {
  readonly skipped: true;
  readonly reason: VisitFactSkipReason;
  readonly externalVisitId: string;
}

export interface VisitFactBuilt {
  readonly skipped: false;
  readonly input: HistoricalFactInput;
}

export type VisitFactResult = VisitFactBuilt | VisitFactSkipped;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

// Raw source economic attributes observed on GET /api/visits
// (chargeRate, billableRateMode — confirmed present via a live,
// read-only field-name probe; no visit-level pay rate/payable field was
// observed anywhere in the same sample, only the caregiver profile's
// separate standing payRate). Preserved here as a normalized SOURCE
// attribute only — never labeled Revenue or Labor, never used to
// calculate either. See Phase 13's scope guardrail: no financial.* Fact,
// no Service Revenue, no Direct Caregiver Labor may be derived from this
// until authoritative invoice/payroll records exist.
function buildSourceEconomicAttributes(raw: AxisCareRawVisit): Record<string, unknown> {
  return {
    chargeRate: numberOrNull(raw.chargeRate),
    billableRateMode: stringOrNull(raw.billableRateMode),
  };
}

// Returns null for both scheduledStart/scheduledEnd when either half of
// the pair is unusable ("" per ServeScheduleVisit's own contract) —
// callers should treat a null pair as "no usable scheduled window" rather
// than silently computing a zero-duration or negative interval.
function scheduledWindow(visit: ServeScheduleVisit): { start: string | null; end: string | null } {
  return {
    start: visit.scheduledStart || null,
    end: visit.scheduledEnd || null,
  };
}

// Builds the scheduling.visit_recorded Fact input for one Visit, or
// reports why it must be skipped. "Unknown Is Preferable to Invented"
// (Metric Registry §2.5) governs both skip reasons: this function never
// fabricates a resident id or an occurrence time.
export function buildVisitHistoricalFact(
  raw: AxisCareRawVisit,
  visit: ServeScheduleVisit,
  resolution: VisitFactResolution
): VisitFactResult {
  if (!resolution.residentId) {
    return { skipped: true, reason: "unresolved_resident_identity", externalVisitId: visit.externalVisitId };
  }

  // occurredAt = when the service actually happened in reality
  // (OccurrenceTimestamps' contract). Actual clock time is preferred when
  // present; scheduled start is the fallback for a Visit that hasn't been
  // delivered yet (still a real, fact-worthy occurrence — a scheduled or
  // removed Visit is not omitted, per Phase 5's "do not silently hide"
  // requirement).
  const occurredAt = visit.actualStart || visit.scheduledStart || null;
  if (!occurredAt) {
    return { skipped: true, reason: "no_usable_occurrence_time", externalVisitId: visit.externalVisitId };
  }

  const { start: scheduledStart, end: scheduledEnd } = scheduledWindow(visit);

  const payload: Record<string, unknown> = {
    caregiverWorkforceMemberId: resolution.caregiverWorkforceMemberId,
    caregiverExternalId: visit.caregiver?.externalId ?? null,
    communityId: resolution.communityId,
    scheduledStart,
    scheduledEnd,
    actualStart: visit.actualStart,
    actualEnd: visit.actualEnd,
    status: visit.status,
    visitType: visit.visitType,
    serviceCode: visit.service?.code ?? null,
    serviceDescription: visit.service?.description ?? null,
    assigned: visit.assigned,
    verified: visit.verified,
    removed: visit.removed,
    careModel: visit.careModel,
    sourceEconomicAttributes: buildSourceEconomicAttributes(raw),
  };

  return {
    skipped: false,
    input: {
      domain: VISIT_FACT_DOMAIN,
      factType: VISIT_FACT_TYPE,
      subject: { subjectType: "resident", subjectId: resolution.residentId },
      occurredAt,
      payload,
      sourceSystem: "axiscare",
      sourceRecordId: visit.externalVisitId,
      provenanceConfidence: visit.provenanceConfidence,
    },
  };
}
