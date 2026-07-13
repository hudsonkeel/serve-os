import type { ServeScheduleSummary } from "@/lib/scheduling/types";

interface ScheduleSummaryMetricsProps {
  summary: ServeScheduleSummary;
}

interface MetricCardProps {
  label: string;
  value: number;
  description: string;
  emphasize?: boolean;
}

function MetricCard({ label, value, description, emphasize }: MetricCardProps) {
  return (
    <div
      className={`min-h-[132px] rounded-xl border p-5 shadow-card ${
        emphasize
          ? "border-warning-text/30 bg-warning-surface"
          : "border-ivory-border bg-surface"
      }`}
    >
      <p
        className={`font-sans text-label font-semibold uppercase tracking-widest ${
          emphasize ? "text-warning-text" : "text-muted"
        }`}
      >
        {label}
      </p>
      <p className="mt-3 font-serif text-4xl font-semibold leading-none tracking-tight text-body">
        {value}
      </p>
      <p className="mt-2 font-sans text-sm leading-relaxed text-muted">
        {description}
      </p>
    </div>
  );
}

// Primary metrics per Part E: Active Visits, Unassigned, In Progress,
// Completed. These are NOT mutually exclusive categories — an unassigned
// visit is also one of the activeVisitCount, for example — so this is
// deliberately presented as an operational snapshot, not a breakdown that
// sums to a total. Scheduled/Removed are shown quietly underneath as
// secondary context, never as urgent work.
export function ScheduleSummaryMetrics({ summary }: ScheduleSummaryMetricsProps) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Active Visits"
          value={summary.activeVisitCount}
          description="Today's active care work"
        />
        <MetricCard
          label="Unassigned"
          value={summary.activeUnassignedCount}
          description="Active visits needing caregiver assignment"
          emphasize={summary.activeUnassignedCount > 0}
        />
        <MetricCard
          label="In Progress"
          value={summary.inProgressCount}
          description="Caregiver currently clocked in"
        />
        <MetricCard
          label="Completed"
          value={summary.completedCount}
          description="Clocked out today"
        />
      </div>
      <p className="mt-3 font-sans text-sm text-muted">
        Scheduled: {summary.scheduledCount}
        {summary.removedVisitCount > 0 && (
          <>
            {" "}
            &middot; {summary.removedVisitCount} removed visit
            {summary.removedVisitCount === 1 ? "" : "s"} excluded from the active
            schedule
          </>
        )}
      </p>
    </div>
  );
}
