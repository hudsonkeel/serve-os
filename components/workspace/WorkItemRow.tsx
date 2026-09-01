import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { withTodaysWorkOrigin } from "@/lib/workspace/originMarker";
import type { WorkItem, WorkItemSourceType } from "@/lib/workspace/workItem";

const SOURCE_LABELS: Record<WorkItemSourceType, string> = {
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
};

const PRIORITY_TONE: Record<NonNullable<WorkItem["priority"]>, "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  high: "warning",
  normal: "neutral",
  low: "neutral",
};

function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
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
