"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ResidentConnections } from "@/lib/data/connections";
import { archiveLearnedDetail } from "@/lib/actions/connections";
import {
  getDisplayGroupForInterestType,
  INTEREST_DISPLAY_GROUP_LABELS,
  InterestDisplayGroup,
} from "@/lib/gettingToKnow/mapping";
import { ResidentInterest } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddSomethingWeLearnedForm } from "./AddSomethingWeLearnedForm";
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

const DISPLAY_GROUP_ORDER: InterestDisplayGroup[] = [
  "enjoys",
  "family",
  "conversation_cue",
  "preference",
];

interface LearnedDetailCardProps {
  interest: ResidentInterest;
  isBusy: boolean;
  onArchive: (id: string) => void;
  actionError: { id: string; message: string } | null;
}

function LearnedDetailCard({
  interest,
  isBusy,
  onArchive,
  actionError,
}: LearnedDetailCardProps) {
  return (
    <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge>
          {interest.confirmed_by_resident ? "Confirmed by Resident" : "Shared / Observed"}
        </Badge>
        {interest.sensitivity !== "standard" && (
          <Badge tone="warning">{titleCase(interest.sensitivity)}</Badge>
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
      <div className="mt-2 flex items-center justify-between">
        <p className="font-sans text-sm text-subtle">
          {titleCase(interest.source_type)}
        </p>
        <button
          type="button"
          onClick={() => onArchive(interest.id)}
          disabled={isBusy}
          className="font-sans text-sm font-medium text-muted transition-colors hover:text-body disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? "Archiving..." : "Archive"}
        </button>
      </div>
      {actionError?.id === interest.id && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {actionError.message}
        </p>
      )}
    </div>
  );
}

interface GettingToKnowProps {
  residentId: string;
  connections: ResidentConnections;
}

// Renamed from "Connections" — same underlying data (resident_relationship_
// profiles, resident_interests, resident_milestones), no schema change. See
// docs/design/RESIDENT_MEMORY.md for why this is its own layer, distinct
// from Current Needs / Working Notes / Timeline. "Recent Touches" (backed
// by resident_touches) is intentionally not rendered here — that table has
// no write path anywhere in the app today, and its concept (chronological
// interaction history) already belongs to Timeline; see the completion
// report for the full duplication-review reasoning. The table/types/data
// functions are untouched in case a future phase wires up real touch
// logging.
export function GettingToKnow({ residentId, connections }: GettingToKnowProps) {
  const router = useRouter();
  const { profile, interests, milestones } = connections;

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [isActing, startActionTransition] = useTransition();
  const [actionError, setActionError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  function handleArchive(interestId: string) {
    setActionError(null);
    setActioningId(interestId);

    startActionTransition(async () => {
      const result = await archiveLearnedDetail({ interestId });

      if (result.error) {
        setActionError({ id: interestId, message: result.error });
        setActioningId(null);
        return;
      }

      router.refresh();
    });
  }

  const groups = DISPLAY_GROUP_ORDER.map((group) => ({
    group,
    label: INTEREST_DISPLAY_GROUP_LABELS[group],
    entries: interests.filter((i) => getDisplayGroupForInterestType(i.interest_type) === group),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-5">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Getting to Know
        </h3>
        <p className="mt-1 font-sans text-sm text-subtle">
          Personal details, interests, preferences, and conversation cues
          that help Serve know this resident well.
        </p>
      </div>

      <div className="space-y-6">
        {/* A. Personal Details */}
        <div>
          <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
            Personal Details
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

        {/* B-E. Things learned, grouped — zero-entry groups are hidden
            rather than each showing their own empty state, so an empty
            resident gets one clear message instead of four small blank
            boxes stacked up. */}
        {groups.length > 0 ? (
          groups.map(({ group, label, entries }) => (
            <div key={group}>
              <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
                {label}
              </p>
              <div className="space-y-3">
                {entries.map((interest) => (
                  <LearnedDetailCard
                    key={interest.id}
                    interest={interest}
                    isBusy={isActing && actioningId === interest.id}
                    onArchive={handleArchive}
                    actionError={actionError}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div>
            <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-muted">
              What We&apos;ve Learned
            </p>
            <EmptyState description="No personal details recorded yet. Add interests, preferences, family details, or conversation cues that help the Serve team connect with this resident. Examples: Baylor football · Gardening · Grandson at Arkansas · Prefers mornings." />
          </div>
        )}

        {/* F. Important Dates — unchanged from the prior "Connections"
            implementation; kept as its own milestone-backed feature. */}
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

        {/* Capture actions */}
        <div className="space-y-3 border-t border-ivory-border pt-5">
          <AddSomethingWeLearnedForm residentId={residentId} />
          <AddMilestoneForm residentId={residentId} />
        </div>
      </div>
    </div>
  );
}
