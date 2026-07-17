"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  changeRelationshipStage,
  createNextAction,
  createRelationshipWorkingNote,
  editNextAction,
  logRelationshipTouch,
  updateRelationshipOwnerAndPriority,
  upsertServiceOpportunity,
} from "@/lib/actions/relationships";
import {
  RELATIONSHIP_ACTION_TYPE_LABELS,
  RELATIONSHIP_ACTION_TYPES,
  RELATIONSHIP_PRIORITIES,
  RELATIONSHIP_PRIORITY_LABELS,
  RELATIONSHIP_STAGE_LABELS,
  RELATIONSHIP_STAGES,
  RELATIONSHIP_TOUCH_TYPES,
  RELATIONSHIP_TOUCH_TYPE_LABELS,
  RELATIONSHIP_WORKING_NOTE_CATEGORIES,
  RELATIONSHIP_WORKING_NOTE_CATEGORY_LABELS,
} from "@/lib/relationships/constants";
import type { NearestOpenAction } from "@/lib/data/relationships";
import type {
  PipelineStage,
  RelationshipActionType,
  RelationshipPriority,
  RelationshipServiceOpportunity,
  RelationshipTouchType,
  RelationshipWorkingNoteCategory,
} from "@/lib/supabase/types";

// Compact inline forms shared by the Action Board and Whiteboard (Part 11:
// "All updates must go through existing controlled actions/RPCs" — every
// one of these calls the same server actions the detail page uses, just
// styled for a smaller card/row context. Extracted once rather than
// duplicated across both surfaces.

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

const fieldClassName =
  "h-9 rounded-md border border-ivory-border bg-surface px-2 font-sans text-sm text-body outline-none focus:border-gold/60";

export function QuickLogTouchForm({
  relationshipId,
  onDone,
}: {
  relationshipId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [touchType, setTouchType] = useState<RelationshipTouchType>("call");
  const [summary, setSummary] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await logRelationshipTouch({ relationshipId, touchType, summary });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-lg border border-ivory-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={touchType}
          onChange={(e) => setTouchType(e.target.value as RelationshipTouchType)}
          className={fieldClassName}
        >
          {RELATIONSHIP_TOUCH_TYPES.map((value) => (
            <option key={value} value={value}>
              {RELATIONSHIP_TOUCH_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What happened?"
          className={`min-w-[220px] flex-1 ${fieldClassName} placeholder:text-subtle`}
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="font-sans text-sm text-muted hover:text-body">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 font-sans text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function QuickAddActionForm({
  relationshipId,
  onDone,
}: {
  relationshipId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [actionType, setActionType] = useState<RelationshipActionType>("follow_up");
  const [dueAt, setDueAt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createNextAction({ relationshipId, actionType, title, dueAt, priority: "normal" });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-lg border border-ivory-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Next action title"
          className={`min-w-[200px] flex-1 ${fieldClassName} placeholder:text-subtle`}
        />
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as RelationshipActionType)}
          className={fieldClassName}
        >
          {RELATIONSHIP_ACTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {RELATIONSHIP_ACTION_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
        <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={fieldClassName} />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="font-sans text-sm text-muted hover:text-body">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 font-sans text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function QuickEditActionForm({
  relationshipId,
  action,
  onDone,
}: {
  relationshipId: string;
  action: NearestOpenAction;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(action.title);
  const [dueAt, setDueAt] = useState(toDateInputValue(action.dueAt));
  const [assignedTo, setAssignedTo] = useState(action.assignedTo ?? "");
  const [priority, setPriority] = useState<RelationshipPriority>(action.priority);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await editNextAction({
        actionId: action.id,
        relationshipId,
        title,
        description: action.description ?? undefined,
        actionType: action.actionType,
        dueAt,
        previousDueAt: action.dueAt,
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
    <form onSubmit={handleSubmit} className="mt-3 rounded-lg border border-ivory-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`min-w-[200px] flex-1 ${fieldClassName}`}
        />
        <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={fieldClassName} />
        <input
          type="text"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          placeholder="Assigned to"
          className={`w-32 ${fieldClassName} placeholder:text-subtle`}
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as RelationshipPriority)}
          className={fieldClassName}
        >
          {RELATIONSHIP_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {RELATIONSHIP_PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="font-sans text-sm text-muted hover:text-body">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 font-sans text-sm text-red-600">{error}</p>}
    </form>
  );
}

// ─── Whiteboard-only quick forms ─────────────────────────────────────────

export function QuickStageForm({
  relationshipId,
  currentStage,
  onDone,
}: {
  relationshipId: string;
  currentStage: PipelineStage;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage>(currentStage);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await changeRelationshipStage({ relationshipId, toStage: stage });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <select value={stage} onChange={(e) => setStage(e.target.value as PipelineStage)} className={fieldClassName}>
        {RELATIONSHIP_STAGES.map((value) => (
          <option key={value} value={value}>
            {RELATIONSHIP_STAGE_LABELS[value]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save Stage"}
      </button>
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function QuickOwnerPriorityForm({
  relationshipId,
  currentOwnerLabel,
  currentPriority,
  onDone,
}: {
  relationshipId: string;
  currentOwnerLabel: string | null;
  currentPriority: RelationshipPriority;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState(currentOwnerLabel ?? "");
  const [priority, setPriority] = useState<RelationshipPriority>(currentPriority);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateRelationshipOwnerAndPriority({ relationshipId, ownerLabel, priority });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={ownerLabel}
        onChange={(e) => setOwnerLabel(e.target.value)}
        placeholder="Owner"
        className={`w-32 ${fieldClassName} placeholder:text-subtle`}
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as RelationshipPriority)}
        className={fieldClassName}
      >
        {RELATIONSHIP_PRIORITIES.map((value) => (
          <option key={value} value={value}>
            {RELATIONSHIP_PRIORITY_LABELS[value]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save"}
      </button>
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function QuickWorkingNoteForm({
  relationshipId,
  onDone,
}: {
  relationshipId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<RelationshipWorkingNoteCategory | "">("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRelationshipWorkingNote({ relationshipId, content, category });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Working note"
        className={`min-w-[220px] flex-1 ${fieldClassName} placeholder:text-subtle`}
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as RelationshipWorkingNoteCategory | "")}
        className={fieldClassName}
      >
        <option value="">No category</option>
        {RELATIONSHIP_WORKING_NOTE_CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {RELATIONSHIP_WORKING_NOTE_CATEGORY_LABELS[value]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save"}
      </button>
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function QuickServiceOpportunityForm({
  relationshipId,
  current,
  onDone,
}: {
  relationshipId: string;
  current: RelationshipServiceOpportunity | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serviceSummary, setServiceSummary] = useState(current?.service_summary ?? "");
  const [visitsPerWeek, setVisitsPerWeek] = useState(current?.visits_per_week?.toString() ?? "");
  const [preferredDays, setPreferredDays] = useState(current?.preferred_days ?? "");
  const [preferredTimeWindows, setPreferredTimeWindows] = useState(current?.preferred_time_windows ?? "");
  const [estimatedVisitMinutes, setEstimatedVisitMinutes] = useState(
    current?.estimated_visit_minutes?.toString() ?? ""
  );
  const [anticipatedStartDate, setAnticipatedStartDate] = useState(current?.anticipated_start_date ?? "");
  const [serviceLocationSummary, setServiceLocationSummary] = useState(current?.service_location_summary ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await upsertServiceOpportunity({
        relationshipId,
        serviceSummary,
        visitsPerWeek,
        preferredDays,
        preferredTimeWindows,
        estimatedVisitMinutes,
        anticipatedStartDate,
        serviceLocationSummary,
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
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={serviceSummary}
          onChange={(e) => setServiceSummary(e.target.value)}
          placeholder="Service summary (e.g. Medication reminders and dinner escort)"
          className={`min-w-[260px] flex-1 ${fieldClassName} placeholder:text-subtle`}
        />
        <input
          type="number"
          min={0}
          max={21}
          value={visitsPerWeek}
          onChange={(e) => setVisitsPerWeek(e.target.value)}
          placeholder="Visits/week"
          className={`w-28 ${fieldClassName} placeholder:text-subtle`}
        />
        <input
          type="number"
          min={1}
          max={1440}
          value={estimatedVisitMinutes}
          onChange={(e) => setEstimatedVisitMinutes(e.target.value)}
          placeholder="Minutes/visit"
          className={`w-32 ${fieldClassName} placeholder:text-subtle`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={preferredDays}
          onChange={(e) => setPreferredDays(e.target.value)}
          placeholder="Preferred days (e.g. Mon, Wed, Fri)"
          className={`min-w-[200px] flex-1 ${fieldClassName} placeholder:text-subtle`}
        />
        <input
          type="text"
          value={preferredTimeWindows}
          onChange={(e) => setPreferredTimeWindows(e.target.value)}
          placeholder="Preferred times (e.g. 4:30-6:00 PM)"
          className={`min-w-[200px] flex-1 ${fieldClassName} placeholder:text-subtle`}
        />
        <input
          type="date"
          value={anticipatedStartDate}
          onChange={(e) => setAnticipatedStartDate(e.target.value)}
          className={fieldClassName}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={serviceLocationSummary}
          onChange={(e) => setServiceLocationSummary(e.target.value)}
          placeholder="Location/context"
          className={`min-w-[220px] flex-1 ${fieldClassName} placeholder:text-subtle`}
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3 font-sans text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="font-sans text-sm text-muted hover:text-body">
          Cancel
        </button>
      </div>
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}
    </form>
  );
}
