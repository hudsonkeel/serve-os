"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveWorkingNote,
  createWorkingNote,
  resolveWorkingNote,
} from "@/lib/actions/residentWorkingNotes";
import { WORKING_NOTE_MAX_LENGTH } from "@/lib/residentWorkingNotes/validation";
import {
  ResidentWorkingNote,
  WorkingNoteCategory,
} from "@/lib/supabase/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { MemorySectionHeader } from "./MemorySectionHeader";

const BELONGS_HERE = [
  "Pending decisions",
  "Scheduled follow-ups",
  "Proposals in progress",
  "Pending paperwork",
];

const DOES_NOT_BELONG_HERE = [
  "Permanent care needs",
  "Completed events",
  "General interests",
];

const CATEGORY_LABELS: Record<WorkingNoteCategory, string> = {
  operational: "Operational",
  family: "Family",
  scheduling: "Scheduling",
  sales: "Sales",
  clinical: "Clinical",
  general: "General",
};

const CATEGORY_OPTIONS: { value: WorkingNoteCategory | ""; label: string }[] = [
  { value: "", label: "No category" },
  { value: "operational", label: "Operational" },
  { value: "family", label: "Family" },
  { value: "scheduling", label: "Scheduling" },
  { value: "sales", label: "Sales" },
  { value: "clinical", label: "Clinical" },
  { value: "general", label: "General" },
];

function compactDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface WorkingNoteCardProps {
  note: ResidentWorkingNote;
  isBusy: boolean;
  onResolve: (id: string) => void;
  onArchive: (id: string) => void;
  actionError: { id: string; message: string } | null;
}

function WorkingNoteCard({
  note,
  isBusy,
  onResolve,
  onArchive,
  actionError,
}: WorkingNoteCardProps) {
  return (
    <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {note.status === "open" ? (
          <Badge tone="blue">Active</Badge>
        ) : (
          <Badge tone="success">Resolved</Badge>
        )}
        {note.category && (
          <Badge tone="neutral">{CATEGORY_LABELS[note.category]}</Badge>
        )}
      </div>

      <p className="whitespace-pre-wrap font-sans text-base text-body">
        {note.content}
      </p>

      <div className="mt-3 space-y-0.5 border-t border-ivory-border/70 pt-2.5">
        <p className="font-sans text-sm text-subtle">
          Added by {note.createdBy} · {compactDateTime(note.createdAt)}
        </p>
        {note.status === "resolved" && note.resolvedAt && (
          <p className="font-sans text-sm text-subtle">
            Resolved by {note.resolvedBy} · {compactDateTime(note.resolvedAt)}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        {note.status === "open" && (
          <button
            type="button"
            onClick={() => onResolve(note.id)}
            disabled={isBusy}
            className="font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? "Resolving..." : "Resolve"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onArchive(note.id)}
          disabled={isBusy}
          className="font-sans text-sm font-medium text-muted transition-colors hover:text-body disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? "Archiving..." : "Archive"}
        </button>
      </div>

      {actionError?.id === note.id && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
          {actionError.message}
        </p>
      )}
    </div>
  );
}

interface ResidentWorkingNotesProps {
  residentId: string;
  notes: ResidentWorkingNote[];
}

export function ResidentWorkingNotes({
  residentId,
  notes,
}: ResidentWorkingNotesProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<WorkingNoteCategory | "">("");
  const [isSaving, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [isActing, startActionTransition] = useTransition();
  const [actionError, setActionError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  function handleAddClick() {
    setContent("");
    setCategory("");
    setSaveError(null);
    setIsAdding(true);
  }

  function handleCancelAdd() {
    setSaveError(null);
    setIsAdding(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    startSaveTransition(async () => {
      const result = await createWorkingNote({ residentId, content, category });

      if (result.error) {
        setSaveError(result.error);
        return;
      }

      setIsAdding(false);
      router.refresh();
    });
  }

  function handleResolve(workingNoteId: string) {
    setActionError(null);
    setActioningId(workingNoteId);

    startActionTransition(async () => {
      const result = await resolveWorkingNote({ workingNoteId });

      if (result.error) {
        setActionError({ id: workingNoteId, message: result.error });
        setActioningId(null);
        return;
      }

      router.refresh();
    });
  }

  function handleArchive(workingNoteId: string) {
    setActionError(null);
    setActioningId(workingNoteId);

    startActionTransition(async () => {
      const result = await archiveWorkingNote({ workingNoteId });

      if (result.error) {
        setActionError({ id: workingNoteId, message: result.error });
        setActioningId(null);
        return;
      }

      router.refresh();
    });
  }

  const remaining = WORKING_NOTE_MAX_LENGTH - content.length;
  const activeNotes = notes.filter((note) => note.status === "open");
  const resolvedNotes = notes.filter((note) => note.status === "resolved");

  return (
    <div>
      <MemorySectionHeader
        title="Working Notes"
        functionalLabel="In Progress"
        purpose="Temporary operational items the Serve team is currently working on."
        belongsHere={!isAdding ? BELONGS_HERE : undefined}
        doesNotBelongHere={!isAdding ? DOES_NOT_BELONG_HERE : undefined}
        primaryAction={
          !isAdding && (
            <button
              type="button"
              onClick={handleAddClick}
              className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
            >
              + Add Working Note
            </button>
          )
        }
      />

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 max-w-2xl rounded-lg border border-ivory-border bg-ivory px-5 py-4"
        >
          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-muted">
              What are we working on?
            </span>
            <textarea
              autoFocus
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={WORKING_NOTE_MAX_LENGTH}
              placeholder="Cary is considering two recurring weekly visits."
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
            />
          </label>
          <p className="mt-1 font-sans text-sm text-subtle">
            Capture a temporary operational item that still requires
            attention, a decision, or follow-through.
          </p>

          <label className="mt-3 block max-w-xs">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-muted">
              Category
            </span>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as WorkingNoteCategory | "")
              }
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <p className="mt-3 font-sans text-sm text-subtle">
            When finished, resolve the note. If it becomes lasting resident
            guidance, update{" "}
            <a
              href="#current-needs"
              className="font-medium text-navy underline-offset-2 hover:underline"
            >
              Current Needs
            </a>
            .
          </p>

          <div className="mt-3 flex items-center justify-between">
            <span className="font-sans text-sm text-subtle">
              {remaining} characters remaining
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelAdd}
                disabled={isSaving}
                className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {saveError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
              {saveError}
            </p>
          )}
        </form>
      )}

      {activeNotes.length === 0 && !isAdding && (
        <EmptyState
          description="No active operational items. Use Working Notes for things currently in motion, such as a family decision, a scheduled follow-up, or a proposal in progress."
        />
      )}

      {activeNotes.length > 0 && (
        <div className="space-y-3">
          {activeNotes.map((note) => (
            <WorkingNoteCard
              key={note.id}
              note={note}
              isBusy={isActing && actioningId === note.id}
              onResolve={handleResolve}
              onArchive={handleArchive}
              actionError={actionError}
            />
          ))}
        </div>
      )}

      {resolvedNotes.length > 0 && (
        <div className={activeNotes.length > 0 ? "mt-5" : undefined}>
          <p className="mb-2 font-sans text-sm font-semibold uppercase tracking-wide text-subtle">
            Resolved
          </p>
          <div className="space-y-3">
            {resolvedNotes.map((note) => (
              <WorkingNoteCard
                key={note.id}
                note={note}
                isBusy={isActing && actioningId === note.id}
                onResolve={handleResolve}
                onArchive={handleArchive}
                actionError={actionError}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
