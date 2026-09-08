// Financial Metric Registry #14 — Scheduled vs. Recorded Delivered Care
// Hours. Lives under lib/scheduling/, not a financial module: this Fact
// type is scheduling-owned (visitFacts.ts), and this is the only metric
// ready to build against it today — see
// docs/intelligence/SERVE_FINANCIAL_INTELLIGENCE_V0.1_ARCHITECTURE_AND_API_DISCOVERY.md
// §4 point 8. A future financial.* metric module would consume the same
// historical_facts table the same way; no shared "metric service" is
// justified for one metric.
//
// The pure calculation (calculateDeliveryHours) is deliberately separated
// from the Supabase-querying wrapper (getDeliveryHoursForWindow) so the
// arithmetic — including the qualification rules and the zero-denominator
// guardrail — is unit-testable without a database.
import "server-only";
import { getCurrentFactsByTypeAndWindow } from "../../intelligence/persistence/historicalFacts.ts";
import { VISIT_FACT_TYPE } from "../visitFacts.ts";
import type { ServeVisitStatus } from "../types.ts";
import type { HistoricalFact } from "../../intelligence/core/index.ts";

export interface VisitFactForMetrics {
  readonly residentId: string;
  readonly communityId: string | null;
  readonly caregiverWorkforceMemberId: string | null;
  readonly status: ServeVisitStatus;
  readonly removed: boolean;
  readonly scheduledStart: string | null;
  readonly scheduledEnd: string | null;
  readonly actualStart: string | null;
  readonly actualEnd: string | null;
}

// Drill-down superset of VisitFactForMetrics — carries the Fact's own id
// and its AxisCare source record id, so a consumer can trace an aggregate
// number back to individual Visit Facts and, from there, to AxisCare
// (Phase 9's Enterprise -> Community -> Client/Caregiver -> Visit ->
// source identity chain).
export interface VisitFactDrillDownRecord extends VisitFactForMetrics {
  readonly factId: string;
  readonly axiscareVisitId: string | null;
}

export function mapFactToVisitRecord(fact: HistoricalFact): VisitFactDrillDownRecord {
  const payload = fact.payload as Record<string, unknown>;
  return {
    factId: fact.id,
    axiscareVisitId: fact.provenance.sourceRecordId,
    residentId: fact.subject.subjectId,
    communityId: (payload.communityId as string | null) ?? null,
    caregiverWorkforceMemberId: (payload.caregiverWorkforceMemberId as string | null) ?? null,
    status: (payload.status as ServeVisitStatus) ?? "unknown",
    removed: Boolean(payload.removed),
    scheduledStart: (payload.scheduledStart as string | null) ?? null,
    scheduledEnd: (payload.scheduledEnd as string | null) ?? null,
    actualStart: (payload.actualStart as string | null) ?? null,
    actualEnd: (payload.actualEnd as string | null) ?? null,
  };
}

export interface DeliveryHoursResult {
  readonly scheduledCareHours: number;
  readonly recordedDeliveredCareHours: number;
  readonly deliveryVarianceHours: number;
  // null = undefined (Registry's zero-denominator guardrail) — never 0.
  readonly deliveryRate: number | null;
  readonly qualifyingScheduledVisitCount: number;
  readonly qualifyingDeliveredVisitCount: number;
}

// Scheduled Care Hours qualifies every Visit that represented real
// scheduled demand — everything except "removed" (AxisCare's strongest
// not-real signal) and "unknown" (a contradictory/anomalous record status.ts
// deliberately refuses to classify, so it must not silently count toward
// anything). "unassigned" still counts: a Visit awaiting caregiver
// assignment is still scheduled demand. Recorded Delivered Care Hours
// qualifies on clock data alone (both actualStart and actualEnd present,
// and not removed) — a deliberately DIFFERENT qualifying subset than
// Scheduled, per Phase 7's instruction to document any such distinction.
const SCHEDULED_QUALIFYING_STATUSES = new Set<ServeVisitStatus>([
  "scheduled",
  "unassigned",
  "in_progress",
  "completed",
]);

function hoursBetween(startIso: string, endIso: string): number | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 3_600_000;
}

export function calculateDeliveryHours(visits: readonly VisitFactForMetrics[]): DeliveryHoursResult {
  let scheduledCareHours = 0;
  let recordedDeliveredCareHours = 0;
  let qualifyingScheduledVisitCount = 0;
  let qualifyingDeliveredVisitCount = 0;

  for (const visit of visits) {
    if (SCHEDULED_QUALIFYING_STATUSES.has(visit.status) && visit.scheduledStart && visit.scheduledEnd) {
      const hours = hoursBetween(visit.scheduledStart, visit.scheduledEnd);
      if (hours !== null) {
        scheduledCareHours += hours;
        qualifyingScheduledVisitCount += 1;
      }
    }

    if (!visit.removed && visit.actualStart && visit.actualEnd) {
      const hours = hoursBetween(visit.actualStart, visit.actualEnd);
      if (hours !== null) {
        recordedDeliveredCareHours += hours;
        qualifyingDeliveredVisitCount += 1;
      }
    }
  }

  const deliveryVarianceHours = recordedDeliveredCareHours - scheduledCareHours;
  const deliveryRate = scheduledCareHours === 0 ? null : (recordedDeliveredCareHours / scheduledCareHours) * 100;

  return {
    scheduledCareHours,
    recordedDeliveredCareHours,
    deliveryVarianceHours,
    deliveryRate,
    qualifyingScheduledVisitCount,
    qualifyingDeliveredVisitCount,
  };
}

export interface DeliveryHoursRollup {
  readonly enterprise: DeliveryHoursResult;
  // null key = non-Community activity, preserved rather than forced into
  // a Community (Business Ontology §51).
  readonly byCommunity: ReadonlyMap<string | null, DeliveryHoursResult>;
  readonly byResident: ReadonlyMap<string, DeliveryHoursResult>;
  // null key = unassigned or not-yet-identity-matched caregiver.
  readonly byCaregiver: ReadonlyMap<string | null, DeliveryHoursResult>;
}

function groupBy<K>(visits: readonly VisitFactForMetrics[], keyFn: (v: VisitFactForMetrics) => K): Map<K, VisitFactForMetrics[]> {
  const groups = new Map<K, VisitFactForMetrics[]>();
  for (const visit of visits) {
    const key = keyFn(visit);
    const existing = groups.get(key);
    if (existing) existing.push(visit);
    else groups.set(key, [visit]);
  }
  return groups;
}

function calculateEachGroup<K>(groups: Map<K, VisitFactForMetrics[]>): Map<K, DeliveryHoursResult> {
  const results = new Map<K, DeliveryHoursResult>();
  for (const [key, visits] of groups) results.set(key, calculateDeliveryHours(visits));
  return results;
}

export function calculateDeliveryHoursRollup(visits: readonly VisitFactForMetrics[]): DeliveryHoursRollup {
  return {
    enterprise: calculateDeliveryHours(visits),
    byCommunity: calculateEachGroup(groupBy(visits, (v) => v.communityId)),
    byResident: calculateEachGroup(groupBy(visits, (v) => v.residentId)),
    byCaregiver: calculateEachGroup(groupBy(visits, (v) => v.caregiverWorkforceMemberId)),
  };
}

// The DB-facing entry point: current-version Visit Facts occurring within
// [occurredFrom, occurredTo], rolled up. Uses historical_facts_current, so
// a superseded (corrected) Visit is never double-counted alongside its
// replacement — see historicalFacts.ts's selectCurrentFacts()/the
// migration's DISTINCT ON view for why this is safe without walking the
// supersedes_fact_id chain.
export async function getDeliveryHoursForWindow(
  occurredFrom: string,
  occurredTo: string
): Promise<{ rollup: DeliveryHoursRollup; records: VisitFactDrillDownRecord[] }> {
  const facts = await getCurrentFactsByTypeAndWindow(VISIT_FACT_TYPE, occurredFrom, occurredTo);
  const records = facts.map(mapFactToVisitRecord);
  return { rollup: calculateDeliveryHoursRollup(records), records };
}
