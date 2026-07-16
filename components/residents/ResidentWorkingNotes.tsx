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

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Working Notes
        </h4>
        {!isAdding && (
          <button
            type="button"
            onClick={handleAddClick}
            className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            + Add Working Note
          </button>
        )}
      </div>
      <p className="mb-4 font-sans text-sm text-subtle">
        Temporary operational information.
      </p>

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4"
        >
          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-muted">
              Working Note
            </span>
            <textarea
              autoFocus
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={WORKING_NOTE_MAX_LENGTH}
              placeholder="Trevor meeting next Tuesday."
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
            />
          </label>

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

      {notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => {
            const isBusy = isActing && actioningId === note.id;
            return (
              <div
                key={note.id}
                className="rounded-lg border border-ivory-border bg-ivory px-5 py-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {note.category && (
                    <Badge tone="neutral">{CATEGORY_LABELS[note.category]}</Badge>
                  )}
                  {note.status === "resolved" && (
                    <Badge tone="success">Resolved</Badge>
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
                      onClick={() => handleResolve(note.id)}
                      disabled={isBusy}
                      className="font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? "Resolving..." : "Resolve"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleArchive(note.id)}
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
          })}
        </div>
      ) : (
        !isAdding && <EmptyState description="No working notes." />
      )}
    </div>
  );
}
