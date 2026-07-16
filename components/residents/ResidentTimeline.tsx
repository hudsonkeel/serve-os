import { ResidentTimelineEvent } from "@/lib/supabase/types";
import { groupTimelineEventsByDay } from "@/lib/residentTimeline/grouping";
import { EmptyState } from "@/components/ui/EmptyState";
import { MemorySectionHeader } from "./MemorySectionHeader";

function eventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface ResidentTimelineProps {
  events: ResidentTimelineEvent[];
}

// Read-only and system generated — there is no manual-entry path, so this
// component has no client-side state or actions.
export function ResidentTimeline({ events }: ResidentTimelineProps) {
  const dayGroups = groupTimelineEventsByDay(events);

  return (
    <div>
      <MemorySectionHeader
        title="Timeline"
        functionalLabel="History"
        purpose="A chronological record of important resident events and interactions."
      />
      <p className="-mt-2 mb-4 max-w-2xl font-sans text-sm text-subtle">
        <span className="font-semibold text-muted">
          Automatically records:{" "}
        </span>
        Resident added · Current Needs updates · Working Note activity
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
                    <p className="font-sans text-sm font-semibold text-body">
                      {event.eventTitle}
                    </p>
                    {event.eventDescription && (
                      <p className="font-sans text-sm text-muted">
                        {event.eventDescription}
                      </p>
                    )}
                    <p className="mt-0.5 font-sans text-sm text-subtle">
                      {eventTime(event.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No resident history yet."
          description="Important events will appear here automatically as the team works with this resident — for example, Current Needs updated or Working Note added."
        />
      )}
    </div>
  );
}
