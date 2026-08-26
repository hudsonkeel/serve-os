"use client";

import { FormEvent, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveQapiDomainNote } from "@/lib/actions/qapiDomainNotes";
import { QAPI_DOMAIN_NOTE_MAX_LENGTH } from "@/lib/qapi/noteValidation";
import type { QapiDomainId, QapiDomainNote } from "@/lib/supabase/types";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface QapiDomainNoteEditorProps {
  domainId: QapiDomainId;
  note: QapiDomainNote | null;
  canEdit: boolean;
}

// "What we're doing" — the human-authored leadership narrative for one QAPI
// domain. Mirrors components/residents/ResidentCurrentNeeds.tsx's
// read/edit/save shape (same underlying versioned-supersede pattern,
// lib/data/qapiDomainNotes.ts), trimmed down for QAPI's compact
// domain-level presentation: no "belongs here" guidance panel, just the
// note, its author/date, and a quick Edit affordance for authorized users.
export function QapiDomainNoteEditor({ domainId, note, canEdit }: QapiDomainNoteEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const textareaId = useId();

  function handleEdit() {
    setContent(note?.content ?? "");
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setError(null);
    setIsEditing(false);
    editButtonRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await saveQapiDomainNote({ domainId, content });

      if (result.error) {
        setError(result.error);
        return;
      }

      setIsEditing(false);
      router.refresh();
    });
  }

  const remaining = QAPI_DOMAIN_NOTE_MAX_LENGTH - content.length;

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit}>
        <label htmlFor={textareaId} className="sr-only">
          What we&apos;re doing
        </label>
        <textarea
          id={textareaId}
          autoFocus
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={QAPI_DOMAIN_NOTE_MAX_LENGTH}
          placeholder="What is leadership currently doing about this domain?"
          className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none placeholder:text-subtle focus:border-gold/60"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-sans text-xs text-subtle">{remaining} characters remaining</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-body hover:border-navy/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 font-sans text-xs text-red-600">{error}</p>}
      </form>
    );
  }

  return (
    <div>
      {note ? (
        <>
          <p className="whitespace-pre-wrap font-sans text-sm text-body">{note.content}</p>
          <p className="mt-1 font-sans text-xs text-subtle">
            {note.createdBy} · {shortDate(note.createdAt)}
          </p>
        </>
      ) : (
        <p className="font-sans text-sm text-muted">No current note.</p>
      )}
      {canEdit && (
        <button
          type="button"
          ref={editButtonRef}
          onClick={handleEdit}
          className="mt-1 font-sans text-xs font-medium text-navy hover:text-navy-light"
        >
          {note ? "Edit" : "Add a note"}
        </button>
      )}
    </div>
  );
}
