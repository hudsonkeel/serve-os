"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeNextAction,
  createNextAction,
  dismissNextAction,
  editNextAction,
} from "@/lib/actions/relationships";
import {
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_ACTION_TYPES,
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
} from "@/lib/relationships/constants";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelationshipAction, RelationshipActionType, RelationshipPriority } from "@/lib/supabase/types";

function compactDate(iso: string | null) {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

interface ActionCardProps {
  relationshipId: string;
  action: RelationshipAction;
}

function ActionCard({ relationshipId, action }: ActionCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"complete" | "dismiss" | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState(action.title);
  const [actionType, setActionType] = useState<RelationshipActionType>(action.action_type);
  const [dueAt, setDueAt] = useState(toDateInputValue(action.due_at));
  const [assignedTo, setAssignedTo] = useState(action.assigned_to ?? "");
  const [priority, setPriority] = useState<RelationshipPriority>(action.priority);
  const [description, setDescription] = useState(action.description ?? "");

  function resetFields() {
    setTitle(action.title);
    setActionType(action.action_type);
    setDueAt(toDateInputValue(action.due_at));
    setAssignedTo(action.assigned_to ?? "");
    setPriority(action.priority);
    setDescription(action.description ?? "");
  }

  function handleComplete() {
    setError(null);
    setBusyAction("complete");
    startTransition(async () => {
      const result = await completeNextAction({ actionId: action.id, relationshipId });
      if (result.error) {
        setError(result.error);
        setBusyAction(null);
        return;
      }
      router.refresh();
    });
  }

  function handleDismiss() {
    setError(null);
    setBusyAction("dismiss");
    startTransition(async () => {
      const result = await dismissNextAction({ actionId: action.id, relationshipId });
      if (result.error) {
        setError(result.error);
        setBusyAction(null);
        return;
      }
      router.refresh();
    });
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusyAction("edit");
    startTransition(async () => {
      const result = await editNextAction({
        actionId: action.id,
        relationshipId,
        title,
        description,
        actionType,
        dueAt,
        previousDueAt: action.due_at,
        assignedTo,
        priority,
      });
      if (result.error) {
        setError(result.error);
        setBusyAction(null);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  const isBusy = isPending && busyAction !== null;

  if (isEditing) {
    return (
      <form
        onSubmit={handleSaveEdit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setIsEditing(false);
            setError(null);
            resetFields();
          }
        }}
        className="rounded-lg border border-ivory-border bg-ivory px-5 py-4"
      >
        <p className="mb-3 font-sans text-sm font-semibold uppercase tracking-widest text-muted">
          Editing Action
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
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Type
              </span>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as RelationshipActionType)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              >
                {RELATIONSHIP_ACTION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_ACTION_TYPE_LABELS[value]}
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
                onChange={(e) => setPriority(e.target.value as RelationshipPriority)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              >
                {RELATIONSHIP_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_PRIORITY_LABELS[value]}
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
            onClick={() => {
              setIsEditing(false);
              setError(null);
              resetFields();
            }}
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
    <div id={`relationship-action-${action.id}`} className="scroll-mt-24 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {action.priority !== "normal" && (
          <Badge tone={action.priority === "urgent" ? "danger" : "warning"}>
            {RELATIONSHIP_PRIORITY_LABELS[action.priority]}
          </Badge>
        )}
        <Badge tone="gold">{RELATIONSHIP_ACTION_TYPE_LABELS[action.action_type]}</Badge>
      </div>

      <p className="font-sans text-base font-semibold text-body">{action.title}</p>
      <p className="mt-1 font-sans text-sm text-muted">
        Due {compactDate(action.due_at)}
        {action.assigned_to ? ` · Assigned to ${action.assigned_to}` : ""}
      </p>
      {action.updated_by && (
        <p className="mt-0.5 font-sans text-sm text-subtle">
          Last updated {compactDate(action.updated_at)} by {action.updated_by}
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
          disabled={isBusy}
          onClick={handleComplete}
          className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-4 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busyAction === "complete" && isPending ? "Completing..." : "Complete"}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            resetFields();
            setError(null);
            setIsEditing(true);
          }}
          className="inline-flex h-11 items-center justify-center rounded-md border border-ivory-border bg-surface px-4 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={handleDismiss}
          className="inline-flex h-11 items-center justify-center rounded-md border border-ivory-border bg-surface px-4 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busyAction === "dismiss" && isPending ? "Dismissing..." : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

interface AddActionFormProps {
  relationshipId: string;
  onDone: () => void;
}

function AddActionForm({ relationshipId, onDone }: AddActionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [actionType, setActionType] = useState<RelationshipActionType>("follow_up");
  const [dueAt, setDueAt] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<RelationshipPriority>("normal");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createNextAction({
        relationshipId,
        actionType,
        title,
        dueAt,
        assignedTo,
        priority,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <p className="mb-3 font-sans text-sm font-semibold uppercase tracking-widest text-muted">
        Add Next Action
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
            placeholder="Call Jennifer"
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
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
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Type
            </span>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as RelationshipActionType)}
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
            >
              {RELATIONSHIP_ACTION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {RELATIONSHIP_ACTION_TYPE_LABELS[value]}
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
              onChange={(e) => setPriority(e.target.value as RelationshipPriority)}
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
            >
              {RELATIONSHIP_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {RELATIONSHIP_PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
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
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-md border border-ivory-border bg-surface px-4 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface RelationshipActionsListProps {
  relationshipId: string;
  actions: RelationshipAction[];
}

export function RelationshipActionsList({ relationshipId, actions }: RelationshipActionsListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const openActions = actions.filter((a) => a.status === "open");

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Next Action
        </h4>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            + Add Another Action
          </button>
        )}
      </div>
      <p className="mb-4 font-sans text-sm text-subtle">
        Accountable next steps for this relationship.
      </p>

      {isAdding && (
        <div className="mb-4">
          <AddActionForm relationshipId={relationshipId} onDone={() => setIsAdding(false)} />
        </div>
      )}

      {openActions.length > 0 ? (
        <div className="space-y-3">
          {openActions.map((action) => (
            <ActionCard key={action.id} relationshipId={relationshipId} action={action} />
          ))}
        </div>
      ) : (
        !isAdding && <EmptyState description="No next action. Add one so this relationship doesn't stall." />
      )}
    </div>
  );
}
