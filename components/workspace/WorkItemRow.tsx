import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { withTodaysWorkOrigin } from "@/lib/workspace/originMarker";
import { CENTRAL_TIME_ZONE, formatPlainDate, isBusinessDateOnly } from "@/lib/utils/date";
import type { WorkItem, WorkItemSourceType } from "@/lib/workspace/workItem";

// Exported for reuse by TodaysWorkView's active-source-filter chip — one
// label vocabulary for a sourceType, never a second copy.
export const SOURCE_LABELS: Record<WorkItemSourceType, string> = {
  relationship_action: "Relationship",
  resident_follow_up: "Resident",
  wellness_follow_up: "Wellness",
  assessment: "Assessment",
  proposal: "Proposal",
  recruiting: "Recruiting",
  other: "Relationship",
  // Governance Connective Slice v0.1
  incident: "Incident",
  infection: "Infection",
  compliance_requirement: "Emergency Preparedness",
  // Today's Work Actionability slice
  corrective_action: "Corrective Action",
  // Incident Corrective Action Lifecycle v0.1
  effectiveness_review: "Effectiveness Review",
  // Infection Lifecycle & Learning Loop v0.1
  infection_follow_up: "Infection Follow-Up",
};

const PRIORITY_TONE: Record<NonNullable<WorkItem["priority"]>, "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  high: "warning",
  normal: "neutral",
  low: "neutral",
};

// Live-validation regression fix — a `date`-only value (corrective action/
// effectiveness review/EPRP due dates) must render as the exact calendar
// day it names, never shifted by whatever timezone this process happens
// to be running in (the previous version had no explicit timeZone at all,
// so a Central-time dev machine rendering a UTC-midnight-parsed date one
// day early — "Sep 24" showing as "Sep 23" — was reproducible exactly as
// reported). A real timestamptz (wellness/relationship completedAt/dueAt)
// keeps its own explicit Central-time formatting instead. See
// lib/utils/date.ts's isBusinessDateOnly for the auto-detection.
function formatDueDate(iso: string): string {
  if (isBusinessDateOnly(iso)) return formatPlainDate(iso, { includeYear: false }) ?? iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, month: "short", day: "numeric" }).format(new Date(iso));
}

export function WorkItemRow({ item }: { item: WorkItem }) {
  const actionLabel = item.status === "in_progress" ? "Resume" : item.status === "completed" ? "View" : "Open";

  return (
    <Link
      href={withTodaysWorkOrigin(item.sourceRoute)}
      className="block rounded-lg border border-ivory-border bg-surface px-5 py-4 transition-colors hover:border-navy/25 hover:shadow-card-hover"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{SOURCE_LABELS[item.sourceType]}</Badge>
        {item.priority && <Badge tone={PRIORITY_TONE[item.priority]}>{item.priority}</Badge>}
        {item.dueAt && <span className="font-sans text-xs text-subtle">Due {formatDueDate(item.dueAt)}</span>}
        {item.completedAt && <span className="font-sans text-xs text-subtle">Completed {formatDueDate(item.completedAt)}</span>}
      </div>
      <p className="font-sans text-base font-semibold text-body">{item.title}</p>
      <p className="mt-1 font-sans text-sm text-muted">{item.explanation}</p>
      {item.recommendedNextStep && (
        <p className="mt-1 font-sans text-xs text-subtle">Recommended: {item.recommendedNextStep}</p>
      )}
      <p className="mt-2 font-sans text-sm font-medium text-navy">{actionLabel} &rarr;</p>
    </Link>
  );
}
