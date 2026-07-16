"use client";

import { FormEvent, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResidentCurrentNeeds } from "@/lib/actions/residentCurrentNeeds";
import { RESIDENT_CURRENT_NEEDS_MAX_LENGTH } from "@/lib/residentCurrentNeeds/validation";
import { ResidentCurrentNeeds as ResidentCurrentNeedsRecord } from "@/lib/supabase/types";

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

interface ResidentCurrentNeedsProps {
  residentId: string;
  currentNeeds: ResidentCurrentNeedsRecord | null;
}

export function ResidentCurrentNeeds({
  residentId,
  currentNeeds,
}: ResidentCurrentNeedsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(currentNeeds?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const textareaId = useId();
  const helperId = useId();

  function handleEdit() {
    setContent(currentNeeds?.content ?? "");
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
      const result = await saveResidentCurrentNeeds({ residentId, content });

      if (result.error) {
        setError(result.error);
        return;
      }

      setIsEditing(false);
      router.refresh();
    });
  }

  const remaining = RESIDENT_CURRENT_NEEDS_MAX_LENGTH - content.length;

  return (
    <div className="mt-6 border-t border-ivory-border pt-6">
      <div className="mb-1 flex items-center justify-between">
        <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">
          Current Needs
        </h4>
        {!isEditing && (
          <button
            type="button"
            ref={editButtonRef}
            onClick={handleEdit}
            className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
          >
            {currentNeeds ? "Edit" : "Add"}
          </button>
        )}
      </div>
      <p className="mb-4 font-sans text-sm text-subtle">
        What Serve staff should know before interacting with this resident.
      </p>

      {isEditing ? (
        <form
          onSubmit={handleSubmit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              handleCancel();
            }
          }}
        >
          <label htmlFor={textareaId} className="sr-only">
            Current needs
          </label>
          <textarea
            id={textareaId}
            aria-describedby={helperId}
            autoFocus
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={RESIDENT_CURRENT_NEEDS_MAX_LENGTH}
            placeholder="Needs medication reminders morning and evening, uses a walker, and prefers an escort to meals."
            className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
          />

          <div id={helperId} className="mt-2 space-y-1">
            <p className="font-sans text-sm text-subtle">
              Keep this concise and current. Include the resident&apos;s most
              important needs, routines, preferences and safety
              considerations.
            </p>
            <p className="font-sans text-sm text-subtle">
              This is not an activity log. Historical events will eventually
              belong in Working Notes or Timeline.
            </p>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="font-sans text-sm text-subtle">
              {remaining} characters remaining
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="rounded-md border border-ivory-border px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:border-navy/20 hover:bg-ivory-warm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-11 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Saving..." : "Save Current Needs"}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
              {error}
            </p>
          )}
        </form>
      ) : currentNeeds ? (
        <div>
          <p className="whitespace-pre-wrap font-sans text-base text-body">
            {currentNeeds.content}
          </p>
          <p className="mt-3 font-sans text-sm text-subtle">
            Updated {fullDate(currentNeeds.createdAt)}
            <br />
            {currentNeeds.authorName}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-ivory-border bg-ivory px-5 py-8 text-center">
          <p className="font-sans text-base text-muted">
            No current needs have been documented yet.
          </p>
          <p className="mt-1.5 font-sans text-sm text-subtle">
            Add the essential information Serve staff should know before
            interacting with this resident.
          </p>
        </div>
      )}
    </div>
  );
}
