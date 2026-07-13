"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeWellnessFollowUp,
  dismissWellnessFollowUp,
} from "@/lib/actions/wellnessFollowUps";
import {
  WellnessFollowUpType,
  WellnessNotePriority,
} from "@/lib/supabase/types";
import { OpenWellnessFollowUp } from "@/lib/data/wellnessFollowUps";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const FOLLOW_UP_TYPE_LABELS: Record<WellnessFollowUpType, string> = {
  reassessment: "Reassessment",
  resident_check_in: "Resident Check-In",
  family_update: "Family Update",
  safety_review: "Safety Review",
  medication_review: "Medication Review",
  mobility_review: "Mobility Review",
  equipment_review: "Equipment Review",
  care_coordination: "Care Coordination",
  service_review: "Service Review",
  documentation: "Documentation",
  other: "Other",
};

const PRIORITY_LABELS: Record<WellnessNotePriority, string> = {
  routine: "Routine",
  monitor: "Monitor",
  important: "Important",
  urgent: "Urgent",
};

function compactDate(iso: string | null) {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface DisplayFollowUp extends OpenWellnessFollowUp {
  sourceObservedAt: string | null;
}

interface OpenFollowUpsListProps {
  residentId: string;
  followUps: DisplayFollowUp[];
}

export function OpenFollowUpsList({ residentId, followUps }: OpenFollowUpsListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleComplete(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await completeWellnessFollowUp(id, residentId);
      if (result.error) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      router.refresh();
    });
  }

  function handleDismiss(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await dismissWellnessFollowUp(id, residentId);
      if (result.error) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      router.refresh();
    });
  }

  if (followUps.length === 0) {
    return <EmptyState description="No open follow-ups right now." />;
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      {followUps.map((followUp) => {
        const isRowPending = isPending && pendingId === followUp.id;

        return (
          <div
            key={followUp.id}
            className={`rounded-lg border px-5 py-4 ${
              followUp.isOverdue
                ? "border-red-200 bg-overdue-surface"
                : "border-ivory-border bg-ivory"
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {followUp.isOverdue && <Badge tone="danger">Overdue</Badge>}
              {followUp.priority !== "routine" && (
                <Badge tone={followUp.priority === "urgent" ? "danger" : "warning"}>
                  {PRIORITY_LABELS[followUp.priority]}
                </Badge>
              )}
              <Badge tone="gold">{FOLLOW_UP_TYPE_LABELS[followUp.follow_up_type]}</Badge>
            </div>

            <p className="font-sans text-base font-semibold text-body">{followUp.title}</p>

            <p className="mt-1 font-sans text-sm text-muted">
              Due {compactDate(followUp.due_at)}
              {followUp.assigned_to ? ` · Assigned to ${followUp.assigned_to}` : ""}
            </p>

            {followUp.sourceObservedAt && (
              <p className="mt-0.5 font-sans text-sm text-subtle">
                From observation on {compactDate(followUp.sourceObservedAt)}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={isRowPending}
                onClick={() => handleComplete(followUp.id)}
                className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-4 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Complete
              </button>
              <button
                type="button"
                disabled={isRowPending}
                onClick={() => handleDismiss(followUp.id)}
                className="inline-flex h-11 items-center justify-center rounded-md border border-ivory-border bg-surface px-4 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
