import { Badge } from "@/components/ui/Badge";
import type { ServeScheduleVisit } from "@/lib/scheduling/types";
import {
  formatVisitTimeRange,
  STATUS_BADGE_TONE,
  STATUS_LABELS,
} from "@/lib/scheduling/format";

interface ScheduleVisitRowProps {
  visit: ServeScheduleVisit;
}

// Renders exactly one active visit. Deliberately does not render:
// externalVisitId, phone/address/DOB/email/billing data, or any raw
// vendor timestamp — only the ServeScheduleVisit fields Part G names as
// safe to show (time range, resident/caregiver display name, service,
// status, verified state, modification reason).
export function ScheduleVisitRow({ visit }: ScheduleVisitRowProps) {
  const { range, zoneNote } = formatVisitTimeRange(
    visit.scheduledStart,
    visit.scheduledEnd,
    visit.timezone
  );
  const caregiverName = visit.caregiver?.displayName ?? "Unassigned";

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ivory-border bg-surface px-5 py-4 shadow-card">
      <div className="w-40 shrink-0">
        <p className="font-sans text-sm font-medium text-body">{range}</p>
        {zoneNote && (
          <p className="mt-0.5 font-sans text-xs text-muted">{zoneNote}</p>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-serif text-base font-medium leading-tight text-body">
          {visit.resident.displayName}
        </p>
        <p className="mt-0.5 font-sans text-sm text-muted">
          {visit.caregiver ? (
            caregiverName
          ) : (
            <span className="font-medium text-warning-text">Unassigned</span>
          )}
          {visit.service?.description && <> &middot; {visit.service.description}</>}
          {!visit.service?.description && visit.service?.code && (
            <> &middot; {visit.service.code}</>
          )}
        </p>
        {visit.modificationReason?.name && (
          <p className="mt-0.5 font-sans text-xs text-muted">
            Modified: {visit.modificationReason.name}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {visit.verified && <Badge tone="success">Verified</Badge>}
        <Badge tone={STATUS_BADGE_TONE[visit.status]}>
          {STATUS_LABELS[visit.status]}
        </Badge>
      </div>
    </div>
  );
}
