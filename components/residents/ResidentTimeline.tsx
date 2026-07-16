import { ResidentTimelineEvent } from "@/lib/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";

function compactDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
  return (
    <div>
      <h4 className="mb-1 font-sans text-label font-semibold uppercase tracking-widest text-muted">
        Timeline
      </h4>
      <p className="mb-4 font-sans text-sm text-subtle">
        Assessments, calls, emails, visits, updates and important resident
        events will appear here automatically.
      </p>

      {events.length > 0 ? (
        <ul className="space-y-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="border-l-2 border-ivory-border pl-4"
            >
              <p className="font-sans text-sm font-semibold text-body">
                {event.eventTitle}
              </p>
              {event.eventDescription && (
                <p className="font-sans text-sm text-muted">
                  {event.eventDescription}
                </p>
              )}
              <p className="mt-0.5 font-sans text-sm text-subtle">
                {compactDateTime(event.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState description="No resident activity yet." />
      )}
    </div>
  );
}
