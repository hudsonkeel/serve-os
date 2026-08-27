"use client";

import { FormEvent, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
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
            <Button type="button" size="small" onClick={handleCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
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
        <Button type="button" size="small" className="mt-1" ref={editButtonRef} onClick={handleEdit}>
          {note ? "Edit" : "Add a note"}
        </Button>
      )}
    </div>
  );
}
