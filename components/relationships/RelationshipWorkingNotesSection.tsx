"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveRelationshipWorkingNote,
  createRelationshipWorkingNote,
  resolveRelationshipWorkingNote,
} from "@/lib/actions/relationships";
import {
  RELATIONSHIP_WORKING_NOTE_CATEGORY_LABELS,
  RELATIONSHIP_WORKING_NOTE_CATEGORIES,
} from "@/lib/relationships/constants";
import { RelationshipWorkingNote, RelationshipWorkingNoteCategory } from "@/lib/supabase/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const WORKING_NOTE_MAX_LENGTH = 1000;

function compactDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface NoteCardProps {
  note: RelationshipWorkingNote;
  isBusy: boolean;
  onResolve: (id: string) => void;
  onArchive: (id: string) => void;
}

function NoteCard({ note, isBusy, onResolve, onArchive }: NoteCardProps) {
  return (
    <div className="rounded-lg border border-ivory-border bg-ivory px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {note.status === "open" ? <Badge tone="blue">Active</Badge> : <Badge tone="success">Resolved</Badge>}
        {note.category && <Badge tone="neutral">{RELATIONSHIP_WORKING_NOTE_CATEGORY_LABELS[note.category]}</Badge>}
      </div>
      <p className="whitespace-pre-wrap font-sans text-base text-body">{note.content}</p>
      <div className="mt-3 space-y-0.5 border-t border-ivory-border/70 pt-2.5">
        <p className="font-sans text-sm text-subtle">
          Added by {note.created_by} · {compactDateTime(note.created_at)}
        </p>
        {note.status === "resolved" && note.resolved_at && (
          <p className="font-sans text-sm text-subtle">
            Resolved by {note.resolved_by} · {compactDateTime(note.resolved_at)}
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
    </div>
  );
}

interface RelationshipWorkingNotesSectionProps {
  relationshipId: string;
  notes: RelationshipWorkingNote[];
}

export function RelationshipWorkingNotesSection({
  relationshipId,
  notes,
}: RelationshipWorkingNotesSectionProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<RelationshipWorkingNoteCategory | "">("");
  const [relevantUntil, setRelevantUntil] = useState("");
  const [isSaving, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [isActing, startActionTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    startSaveTransition(async () => {
      const result = await createRelationshipWorkingNote({
        relationshipId,
        content,
        category,
        relevantUntil: relevantUntil || undefined,
      });
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      setIsAdding(false);
      setContent("");
      setCategory("");
      setRelevantUntil("");
      router.refresh();
    });
  }

  function handleResolve(id: string) {
    setActioningId(id);
    startActionTransition(async () => {
      await resolveRelationshipWorkingNote({ workingNoteId: id });
      router.refresh();
    });
  }

  function handleArchive(id: string) {
    setActioningId(id);
    startActionTransition(async () => {
      await archiveRelationshipWorkingNote({ workingNoteId: id });
      router.refresh();
    });
  }

  const activeNotes = notes.filter((n) => n.status === "open");
  const resolvedNotes = notes.filter((n) => n.status === "resolved");
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
            onClick={() => setIsAdding(true)}
            className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            + Add Working Note
          </button>
        )}
      </div>
      <p className="mb-4 font-sans text-sm text-subtle">
        Temporary context or thinking currently relevant to moving this relationship forward.
      </p>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-ivory-border bg-ivory px-5 py-4">
          <label className="block">
            <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
              Working Note
            </span>
            <textarea
              autoFocus
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={WORKING_NOTE_MAX_LENGTH}
              placeholder="Family is discussing options this weekend."
              className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
            />
          </label>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Category
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as RelationshipWorkingNoteCategory | "")}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              >
                <option value="">No category</option>
                {RELATIONSHIP_WORKING_NOTE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {RELATIONSHIP_WORKING_NOTE_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                Review by (optional)
              </span>
              <input
                type="date"
                value={relevantUntil}
                onChange={(e) => setRelevantUntil(e.target.value)}
                className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none focus:border-gold/60"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="font-sans text-sm text-subtle">{remaining} characters remaining</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
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
        <EmptyState description="No active working notes. Use these for temporary context that helps move this relationship forward." />
      )}

      {activeNotes.length > 0 && (
        <div className="space-y-3">
          {activeNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isBusy={isActing && actioningId === note.id}
              onResolve={handleResolve}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      {resolvedNotes.length > 0 && (
        <div className={activeNotes.length > 0 ? "mt-5" : undefined}>
          <p className="mb-2 font-sans text-sm font-semibold uppercase tracking-wide text-subtle">Resolved</p>
          <div className="space-y-3">
            {resolvedNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                isBusy={isActing && actioningId === note.id}
                onResolve={handleResolve}
                onArchive={handleArchive}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
