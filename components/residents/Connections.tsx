import { ResidentConnections } from "@/lib/data/connections";
import { InterestConfidence, InterestSensitivity } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddConnectionNoteForm } from "./AddConnectionNoteForm";
import { AddMilestoneForm } from "./AddMilestoneForm";
import { RelationshipDetailsCard } from "./RelationshipDetailsCard";

function titleCase(value: string | null | undefined) {
  if (!value) return "-";
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function compactDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function milestoneDateLabel(milestone: {
  event_date: string | null;
  month: number | null;
  day: number | null;
}) {
  if (milestone.event_date) return compactDate(milestone.event_date);
  if (milestone.month && milestone.day) {
    return `${MONTH_NAMES[milestone.month - 1]} ${milestone.day}`;
  }
  if (milestone.month) return MONTH_NAMES[milestone.month - 1];
  return "Date not set";
}

const CONFIDENCE_LABELS: Record<InterestConfidence, string> = {
  unconfirmed: "Unconfirmed",
  probable: "Probable",
  confirmed: "Confirmed",
};

const SENSITIVITY_LABELS: Record<InterestSensitivity, string> = {
  standard: "Standard",
  sensitive: "Sensitive",
  high: "High Sensitivity",
};

interface ConnectionsProps {
  residentId: string;
  connections: ResidentConnections;
}

export function Connections({ residentId, connections }: ConnectionsProps) {
  const { profile, interests, milestones, touches } = connections;

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-5">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Connections
        </h3>
        <p className="mt-1 font-sans text-sm text-subtle">
          Meaningful details and touchpoints that help Serve know this
          resident well.
        </p>
      </div>

      <div className="space-y-6">
        {/* Relationship summary */}
        <div>
          <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            What we know
          </p>
          <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
            <RelationshipDetailsCard
              residentId={residentId}
              initialPreferredName={profile?.preferred_name ?? ""}
              initialRelationshipStage={profile?.relationship_stage ?? "unknown"}
            />
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ivory-border pt-3">
              <div>
                <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                  Last Meaningful Touch
                </p>
                <p className="mt-0.5 font-sans text-sm text-body">
                  {compactDate(profile?.last_meaningful_touch_at)}
                </p>
              </div>
              <div>
                <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                  Suggested Follow-up
                </p>
                <p className="mt-0.5 font-sans text-sm text-body">
                  {compactDate(profile?.next_suggested_touch_at)}
                </p>
              </div>
            </div>
          </div>
          {profile?.do_not_contact && (
            <div className="mt-2">
              <Badge tone="warning">Do Not Contact</Badge>
            </div>
          )}
        </div>

        {/* Interests */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
              Interests
            </p>
          </div>
          {interests.length > 0 ? (
            <div className="space-y-3">
              {interests.map((interest) => {
                const showSensitive =
                  interest.sensitivity !== "standard" ||
                  interest.interest_type === "faith_or_tradition";

                return (
                  <div
                    key={interest.id}
                    className="rounded-lg border border-ivory-border bg-ivory px-5 py-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone="gold">{titleCase(interest.interest_type)}</Badge>
                      <Badge>
                        {interest.confirmed_by_resident
                          ? "Shared by Resident"
                          : "Observed by Staff"}
                      </Badge>
                      <Badge>{CONFIDENCE_LABELS[interest.confidence]}</Badge>
                      {showSensitive && (
                        <Badge tone="warning">
                          {SENSITIVITY_LABELS[interest.sensitivity]}
                        </Badge>
                      )}
                    </div>
                    <p className="font-sans text-sm font-medium text-body">
                      {interest.interest_value}
                    </p>
                    {interest.details && (
                      <p className="mt-1 font-sans text-sm leading-relaxed text-body">
                        {interest.details}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState description="Nothing recorded yet. Add what Serve staff have learned about this resident." />
          )}
        </div>

        {/* Milestones */}
        <div>
          <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            Important Dates
          </p>
          {milestones.length > 0 ? (
            <div className="space-y-3">
              {milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className="rounded-lg border border-ivory-border bg-ivory px-5 py-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="gold">{titleCase(milestone.milestone_type)}</Badge>
                    <Badge>{milestone.confirmed ? "Confirmed" : "Unconfirmed"}</Badge>
                    {milestone.appropriate_for_outreach && (
                      <Badge>Suggested Follow-up</Badge>
                    )}
                  </div>
                  <p className="font-sans text-sm font-medium text-body">
                    {milestone.title}
                  </p>
                  <p className="mt-0.5 font-sans text-sm text-muted">
                    {milestoneDateLabel(milestone)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState description="No important dates recorded yet." />
          )}
        </div>

        {/* Recent touches */}
        <div>
          <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            Recent Touches
          </p>
          {touches.length > 0 ? (
            <div className="space-y-3">
              {touches.map((touch) => (
                <div
                  key={touch.id}
                  className="rounded-lg border border-ivory-border bg-ivory px-5 py-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="gold">{titleCase(touch.touch_type)}</Badge>
                    <Badge>{titleCase(touch.channel)}</Badge>
                    <Badge>{titleCase(touch.status)}</Badge>
                  </div>
                  <p className="font-sans text-sm text-muted">
                    {compactDate(
                      touch.completed_at || touch.scheduled_for || touch.created_at
                    )}
                  </p>
                  {(touch.reason || touch.outcome) && (
                    <p className="mt-1 font-sans text-sm leading-relaxed text-body">
                      {touch.outcome || touch.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState description="No touches logged yet." />
          )}
        </div>

        {/* Capture actions */}
        <div className="space-y-3 border-t border-ivory-border pt-5">
          <AddConnectionNoteForm residentId={residentId} />
          <AddMilestoneForm residentId={residentId} />
        </div>
      </div>
    </div>
  );
}
