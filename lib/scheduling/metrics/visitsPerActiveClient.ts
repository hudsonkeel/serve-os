// Financial Metric Registry #12 — Visits per Active Client. Reuses the
// existing canonical Active Client pipeline
// (getAuditEligibleActiveClientResidents(), lib/data/residentServeRelationships.ts)
// rather than duplicating lifecycle logic — see
// docs/intelligence/SERVE_FINANCIAL_INTELLIGENCE_V0.1_ARCHITECTURE_AND_API_DISCOVERY.md
// §3 for why that function is the confirmed canonical source.
//
// Per Phase 8's instruction, the period denominator convention (average
// Active Clients during the period / period-end / unique serviced
// clients — Registry §40, "Leadership Definition Required") is NOT
// silently chosen here. The Visit-count query and Active Client
// population access are both implemented and correct; the final ratio is
// returned with its actual methodology named explicitly
// (activeClientDenominatorMethodology) and flagged pending_hud_decision,
// rather than presented as a settled "Defined" figure.
import "server-only";
import { getCurrentFactsByTypeAndWindow } from "../../intelligence/persistence/historicalFacts.ts";
import { VISIT_FACT_TYPE } from "../visitFacts.ts";
import { getAuditEligibleActiveClientResidents } from "../../data/residentServeRelationships.ts";
import type { CommunityQueryFilter } from "../../auth/communityScope.ts";
import { mapFactToVisitRecord, type VisitFactDrillDownRecord } from "./deliveryHours.ts";
import { calculateVisitsPerActiveClient } from "./visitsPerActiveClientMath.ts";
import { businessDateRangeToUtcWindow } from "../businessTime.ts";

export { calculateVisitsPerActiveClient } from "./visitsPerActiveClientMath.ts";

export interface VisitsPerActiveClientResult {
  readonly qualifyingVisitCount: number;
  readonly activeClientCount: number;
  // null = undefined (zero-Active-Client guardrail, same discipline as
  // metric #14's zero-Scheduled-Hours guardrail) — never 0.
  readonly ratio: number | null;
  readonly activeClientDenominatorMethodology: "current_snapshot";
  readonly denominatorPolicyStatus: "pending_hud_decision";
}

// A Visit "qualifies" for this metric when it was actually delivered
// (status === 'completed') — a documented choice, not an implicit
// default: "how much Visit activity does the average Active Client
// receive" reads most naturally as delivered service, not merely
// scheduled demand. deliveryHours.ts's SCHEDULED_QUALIFYING_STATUSES uses
// a deliberately different, wider qualifying set for metric #14 — see
// its own comment for why the two metrics don't share one definition of
// "qualifying Visit."
function isQualifyingVisit(record: VisitFactDrillDownRecord): boolean {
  return record.status === "completed";
}

export async function getVisitsPerActiveClient(
  occurredFrom: string,
  occurredTo: string,
  filter: CommunityQueryFilter
): Promise<VisitsPerActiveClientResult> {
  const [facts, activeClients] = await Promise.all([
    getCurrentFactsByTypeAndWindow(VISIT_FACT_TYPE, occurredFrom, occurredTo),
    getAuditEligibleActiveClientResidents(filter),
  ]);

  const qualifyingVisitCount = facts.map(mapFactToVisitRecord).filter(isQualifyingVisit).length;
  const activeClientCount = activeClients.length;
  const { ratio } = calculateVisitsPerActiveClient(qualifyingVisitCount, activeClientCount);

  return {
    qualifyingVisitCount,
    activeClientCount,
    ratio,
    activeClientDenominatorMethodology: "current_snapshot",
    denominatorPolicyStatus: "pending_hud_decision",
  };
}

// Business-date-aware entry point — same Central-civil-date window
// conversion as deliveryHours.ts's getDeliveryHoursForBusinessDateRange(),
// so "Sept 5 through Sept 7" means the same UTC instants in both metrics
// (Phase 5's "avoid competing interpretations"). Only the Visit-count
// period semantics are aligned here — the Active Client denominator
// policy question is untouched and still pending_hud_decision.
export async function getVisitsPerActiveClientForBusinessDateRange(
  startDate: string,
  endDate: string,
  filter: CommunityQueryFilter
): Promise<VisitsPerActiveClientResult> {
  const { startUtc, endUtcExclusive } = businessDateRangeToUtcWindow(startDate, endDate);
  const inclusiveEnd = new Date(new Date(endUtcExclusive).getTime() - 1).toISOString();
  return getVisitsPerActiveClient(startUtc, inclusiveEnd, filter);
}
