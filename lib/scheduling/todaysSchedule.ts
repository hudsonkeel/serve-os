import "server-only";
import { getTodaysVisitsBounded } from "../integrations/axiscare/visits.ts";
import { todaysDateStringCentral } from "../integrations/axiscare/centralDate.ts";
import { isAxisCareScheduleEnabled } from "../integrations/axiscare/config.ts";
import { AxisCareError, type AxisCareErrorCategory } from "../integrations/axiscare/errors.ts";
import type { AxisCareRawVisit } from "../integrations/axiscare/types.ts";
import { normalizeAxisCareVisit } from "./normalize.ts";
import { auditScheduledVsStartEndFields } from "./fieldPairAudit.ts";
import type {
  ServeScheduleSummary,
  ServeScheduleVisit,
  ServeTodaysScheduleResult,
  ServeTodaysScheduleUnavailableReason,
} from "./types.ts";

// rate_limit has no dedicated Serve-facing reason in
// ServeTodaysScheduleUnavailableReason (the source task's own list omits
// it) — mapped to upstream_unavailable as the closest honest fit, since a
// rate limit is fundamentally "the upstream can't serve this request
// right now," same as a 5xx.
function toUnavailableReason(
  category: AxisCareErrorCategory
): ServeTodaysScheduleUnavailableReason {
  switch (category) {
    case "configuration":
      return "not_configured";
    case "authentication":
      return "authentication";
    case "authorization":
      return "authorization";
    case "rate_limit":
      return "upstream_unavailable";
    case "timeout":
      return "timeout";
    case "upstream_unavailable":
      return "upstream_unavailable";
    case "invalid_response":
      return "invalid_response";
    case "unknown":
    default:
      return "unknown";
  }
}

// Takes ALL normalized records (removed included) — sourceRecordCount and
// removedVisitCount need to see removed visits to count them; every other
// bucket explicitly excludes them. A removed visit is never counted as
// actionable unassigned coverage, regardless of whether it has a
// caregiver — this was the exact bug this shape replaces (see
// ServeScheduleSummary's module comment in types.ts).
export function summarizeVisits(visits: ServeScheduleVisit[]): ServeScheduleSummary {
  const summary: ServeScheduleSummary = {
    sourceRecordCount: visits.length,
    activeVisitCount: 0,
    removedVisitCount: 0,
    activeAssignedCount: 0,
    activeUnassignedCount: 0,
    scheduledCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    missedCount: 0,
    unknownCount: 0,
  };

  for (const visit of visits) {
    if (visit.status === "removed") {
      summary.removedVisitCount += 1;
      continue; // removed visits never contribute to any active bucket.
    }

    summary.activeVisitCount += 1;
    if (visit.assigned) summary.activeAssignedCount += 1;
    else summary.activeUnassignedCount += 1;

    switch (visit.status) {
      case "scheduled":
        summary.scheduledCount += 1;
        break;
      case "in_progress":
        summary.inProgressCount += 1;
        break;
      case "completed":
        summary.completedCount += 1;
        break;
      case "missed":
        summary.missedCount += 1;
        break;
      case "unknown":
        summary.unknownCount += 1;
        break;
      // "unassigned" is already captured above via visit.assigned, and
      // "cancelled" is not currently produced by status.ts (see its
      // module comment) — no dedicated bucket exists for either, matching
      // status.ts's actual output space.
      default:
        break;
    }
  }

  return summary;
}

// Calls the AxisCare Visits wrapper and returns a vendor-neutral,
// sanitized result. Never exposes raw AxisCare errors, raw payloads,
// token details, or unnecessary client/caregiver fields — only what
// ServeScheduleVisit/ServeTodaysScheduleResult already promise.
export async function getAxisCareTodaysSchedule(): Promise<ServeTodaysScheduleResult> {
  const fetchedAt = new Date().toISOString();
  const operationalDate = todaysDateStringCentral();

  // Release-control gate — checked before anything else, and before any
  // AxisCare configuration/credential lookup, so a disabled feature never
  // makes a request AND never reveals whether credentials exist (a
  // disabled and a misconfigured environment must be indistinguishable
  // from this function's caller's perspective beyond the `reason` value).
  if (!isAxisCareScheduleEnabled()) {
    return {
      available: false,
      sourceSystem: "axiscare",
      fetchedAt,
      operationalDate,
      reason: "disabled",
      safeMessage: "AxisCare schedule visibility is not enabled in Serve OS.",
    };
  }

  try {
    const { pages, truncated } = await getTodaysVisitsBounded();

    const rawVisits: AxisCareRawVisit[] = pages.flatMap((page) =>
      Array.isArray(page.results?.visits)
        ? (page.results!.visits! as AxisCareRawVisit[])
        : []
    );

    const visits = rawVisits
      .map((raw) => normalizeAxisCareVisit(raw))
      .filter((visit): visit is ServeScheduleVisit => visit !== null);

    // activeVisits is what a Today's Schedule UI should render by
    // default — removed records stay in `visits` for audit/variance
    // purposes but are excluded here. Do not call removed visits "missed"
    // or "cancelled" — see status.ts and
    // docs/architecture/SERVE_SCHEDULING_INTELLIGENCE.md's Removed Visit
    // Policy; AxisCare gives no evidence supporting either label.
    const activeVisits = visits.filter((visit) => visit.status !== "removed");

    return {
      available: true,
      sourceSystem: "axiscare",
      fetchedAt,
      operationalDate,
      visits,
      activeVisits,
      summary: summarizeVisits(visits),
      timeFieldAudit: auditScheduledVsStartEndFields(rawVisits),
      pagination: { hasNextPage: truncated },
    };
  } catch (err) {
    const category = err instanceof AxisCareError ? err.category : "unknown";
    const safeMessage =
      err instanceof AxisCareError
        ? err.message
        : "AxisCare request failed for an unknown reason.";

    return {
      available: false,
      sourceSystem: "axiscare",
      fetchedAt,
      operationalDate,
      reason: toUnavailableReason(category),
      safeMessage,
    };
  }
}
