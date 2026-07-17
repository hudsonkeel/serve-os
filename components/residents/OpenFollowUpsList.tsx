"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeWellnessFollowUp,
  dismissWellnessFollowUp,
  editWellnessFollowUp,
} from "@/lib/actions/wellnessFollowUps";
import {
  VALID_FOLLOW_UP_TYPES,
  VALID_PRIORITIES,
} from "@/lib/wellnessFollowUps/validation";
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

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export interface DisplayFollowUp extends OpenWellnessFollowUp {
  sourceObservedAt: string | null;
}

interface FollowUpCardProps {
  residentId: string;
  followUp: DisplayFollowUp;
}

function FollowUpCard({ residentId, followUp }: FollowUpCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [action, setAction] = useState<"complete" | "dismiss" | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState(followUp.title);
  const [followUpType, setFollowUpType] = useState<WellnessFollowUpType>(
    followUp.follow_up_type
  );
  const [dueAt, setDueAt] = useState(toDateInputValue(followUp.due_at));
  const [assignedTo, setAssignedTo] = useState(followUp.assigned_to ?? "");
  const [priority, setPriority] = useState<WellnessNotePriority>(followUp.priority);
  const [description, setDescription] = useState(followUp.description ?? "");

  function resetFields() {
    setTitle(followUp.title);
    setFollowUpType(followUp.follow_up_type);
    setDueAt(toDateInputValue(followUp.due_at));
    setAssignedTo(followUp.assigned_to ?? "");
    setPriority(followUp.priority);
    setDescription(followUp.description ?? "");
  }

  function handleEdit() {
    resetFields();
    setError(null);
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setError(null);
    setIsEditing(false);
  }

  function handleComplete() {
    setError(null);
    setAction("complete");
    startTransition(async () => {
      const result = await completeWellnessFollowUp(followUp.id, residentId);
      if (result.error) {
        setError(result.error);
        setAction(null);
        return;
      }
      router.refresh();
    });
  }

  function handleDismiss() {
    setError(null);
    setAction("dismiss");
    startTransition(async () => {
      const result = await dismissWellnessFollowUp(followUp.id, residentId);
      if (result.error) {
        setError(result.error);
        setAction(null);
        return;
      }
      router.refresh();
    });
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAction("edit");

    startTransition(async () => {
      const result = await editWellnessFollowUp({
        followUpId: followUp.id,
        residentId,
        title,
        description,
        followUpType,
        dueAt,
        previousDueAt: followUp.due_at,
        assignedTo,
        priority,
      });

      if (result.error) {
        setError(result.error);
        setAction(null);
        return;
      }

      setIsEditing(false);
      router.refresh();
    });
  }

  const isRowPending = isPending && action !== null;

  if (isEditing) {
    return (
      <form
        onSubmit={handleSaveEdit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            handleCancelEdit();
          }
        }}
        className="rounded-lg border border-ivory-border bg-ivory px-5 py-4"
      >
        <p className="mb-3 font-sans text-sm font-semibold uppercase tracking-widest text-muted">
          Editing Follow-up
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Due Date
              </span>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Assigned To
              </span>
              <input
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="e.g. Elizabeth Butler"
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Category
              </span>
              <select
                value={followUpType}
                onChange={(e) => setFollowUpType(e.target.value as WellnessFollowUpType)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              >
                {VALID_FOLLOW_UP_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {FOLLOW_UP_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Priority
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as WellnessNotePriority)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              >
                {VALID_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Notes
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-4 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleCancelEdit}
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center rounded-md border border-ivory-border bg-surface px-4 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
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

      {followUp.updated_by && (
        <p className="mt-0.5 font-sans text-sm text-subtle">
          Last updated {compactDate(followUp.updated_at)} by {followUp.updated_by}
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={isRowPending}
          onClick={handleComplete}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-4 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {action === "complete" && isPending ? "Completing..." : "Complete"}
        </button>
        <button
          type="button"
          disabled={isRowPending}
          onClick={handleEdit}
          className="inline-flex h-11 items-center justify-center rounded-md border border-ivory-border bg-surface px-4 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={isRowPending}
          onClick={handleDismiss}
          className="inline-flex h-11 items-center justify-center rounded-md border border-ivory-border bg-surface px-4 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {action === "dismiss" && isPending ? "Dismissing..." : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

interface OpenFollowUpsListProps {
  residentId: string;
  followUps: DisplayFollowUp[];
}

export function OpenFollowUpsList({ residentId, followUps }: OpenFollowUpsListProps) {
  if (followUps.length === 0) {
    return <EmptyState description="No open follow-ups right now." />;
  }

  return (
    <div className="space-y-3">
      {followUps.map((followUp) => (
        <FollowUpCard key={followUp.id} residentId={residentId} followUp={followUp} />
      ))}
    </div>
  );
}
