import { ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleSummaryMetrics } from "@/components/scheduling/ScheduleSummaryMetrics";
import { ScheduleUnavailableState } from "@/components/scheduling/ScheduleUnavailableState";
import { ScheduleVisitRow } from "@/components/scheduling/ScheduleVisitRow";
import { axisCareRealTimeViewUrl } from "@/lib/workflows/serveWorkflows";
import { formatUpdatedAt, sortVisitsByScheduledStart } from "@/lib/scheduling/format";
import type { ServeTodaysScheduleResult } from "@/lib/scheduling/types";

interface TodaysSchedulePanelProps {
  result: ServeTodaysScheduleResult;
}

// Live, read-only Today's Schedule for Workspace. Consumes only
// ServeTodaysScheduleResult (no AxisCareRaw* types ever cross into this
// component) and takes the already-fetched result as a prop rather than
// calling getAxisCareTodaysSchedule() itself, so a single Workspace page
// render makes exactly one AxisCare request no matter how this component
// tree grows. AxisCare remains the scheduling system of record — this
// view is visibility only, never write-back.
export function TodaysSchedulePanel({ result }: TodaysSchedulePanelProps) {
  const isDisabled = !result.available && result.reason === "disabled";
  const unassignedVisits = result.available
    ? sortVisitsByScheduledStart(
        result.activeVisits.filter((visit) => !visit.assigned)
      )
    : [];
  const otherVisits = result.available
    ? sortVisitsByScheduledStart(
        result.activeVisits.filter((visit) => visit.assigned)
      )
    : [];

  return (
    <section className="py-10">
      <div className={`flex flex-wrap items-baseline justify-between gap-2 ${isDisabled ? "mb-5" : "mb-1"}`}>
        <h2 className="font-serif text-section-title font-light text-body">
          Today&apos;s Schedule
        </h2>
        {!isDisabled && (
          <span className="font-sans text-sm text-muted">
            {formatUpdatedAt(result.fetchedAt)}
          </span>
        )}
      </div>
      {!isDisabled && (
        <p className="mb-5 font-sans text-sm leading-relaxed text-muted">
          Live care schedule visibility from AxisCare. AxisCare remains the
          scheduling system of record.
        </p>
      )}

      {!result.available && <ScheduleUnavailableState reason={result.reason} />}

      {result.available && (
        <div className="space-y-6">
          <ScheduleSummaryMetrics summary={result.summary} />

          {result.activeVisits.length === 0 && (
            <EmptyState description="No active AxisCare visits are scheduled today." />
          )}

          {unassignedVisits.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="font-sans text-base font-semibold text-body">
                  Attention Needed
                </h3>
                <span className="inline-flex items-center rounded-full bg-warning-surface px-3 py-1 font-sans text-badge font-semibold uppercase tracking-wide text-warning-text">
                  {unassignedVisits.length} unassigned
                </span>
              </div>
              <div className="space-y-2">
                {unassignedVisits.map((visit) => (
                  <ScheduleVisitRow key={visit.externalVisitId} visit={visit} />
                ))}
              </div>
            </div>
          )}

          {otherVisits.length > 0 && (
            <div>
              <h3 className="mb-3 font-sans text-base font-semibold text-body">
                Today&apos;s Visits
              </h3>
              <div className="space-y-2">
                {otherVisits.map((visit) => (
                  <ScheduleVisitRow key={visit.externalVisitId} visit={visit} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result.available && (
        <div className="mt-6">
          <a
            href={axisCareRealTimeViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-ivory-border bg-ivory px-4 font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
          >
            Open AxisCare Real Time View
            <ExternalLink size={15} strokeWidth={1.75} />
          </a>
          <p className="mt-2 font-sans text-sm text-muted">
            Make schedule changes and review full visit details in AxisCare.
          </p>
        </div>
      )}
    </section>
  );
}
