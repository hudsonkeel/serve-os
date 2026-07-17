import { RelationshipTimelineEvent } from "@/lib/supabase/types";
import { groupEventsByDay } from "@/lib/utils/timelineGrouping";
import { EmptyState } from "@/components/ui/EmptyState";

function eventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface RelationshipTimelineSectionProps {
  events: RelationshipTimelineEvent[];
}

// Read-only, system generated, append-only — same rendering pattern as
// components/residents/ResidentTimeline.tsx, reusing the same generic
// day-grouping helper (lib/utils/timelineGrouping.ts) rather than
// duplicating the Central-time bucketing logic.
export function RelationshipTimelineSection({ events }: RelationshipTimelineSectionProps) {
  const dayGroups = groupEventsByDay(events, (event) => event.created_at);

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h3 className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Timeline
      </h3>
      <p className="mb-4 font-sans text-sm text-subtle">
        Chronological history of this relationship — system generated.
      </p>

      {dayGroups.length > 0 ? (
        <div className="space-y-5">
          {dayGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 font-sans text-sm font-semibold uppercase tracking-wide text-subtle">
                {group.label}
              </p>
              <ul className="space-y-3">
                {group.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-ivory-border pl-4">
                    <p className="font-sans text-sm font-semibold text-body">{event.event_title}</p>
                    {event.event_description && (
                      <p className="font-sans text-sm text-muted">{event.event_description}</p>
                    )}
                    <p className="mt-0.5 font-sans text-sm text-subtle">{eventTime(event.created_at)}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState description="No relationship history yet." />
      )}
    </div>
  );
}
