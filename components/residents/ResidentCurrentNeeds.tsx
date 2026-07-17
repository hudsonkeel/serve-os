"use client";

import { FormEvent, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResidentCurrentNeeds } from "@/lib/actions/residentCurrentNeeds";
import { RESIDENT_CURRENT_NEEDS_MAX_LENGTH } from "@/lib/residentCurrentNeeds/validation";
import { ResidentCurrentNeeds as ResidentCurrentNeedsRecord } from "@/lib/supabase/types";
import { MemorySectionHeader } from "./MemorySectionHeader";

const BELONGS_HERE = [
  "Medication reminders",
  "Mobility assistance",
  "Meal escorts",
  "Safety considerations",
];

const DOES_NOT_BELONG_HERE = [
  "Phone calls",
  "Emails",
  "Temporary follow-ups",
  "Pending decisions",
  "Historical events",
];

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
    <div>
      <MemorySectionHeader
        title="Current Needs"
        purpose="Current care guidance. Update whenever the resident's ongoing needs change."
        belongsHere={!isEditing ? BELONGS_HERE : undefined}
        doesNotBelongHere={!isEditing ? DOES_NOT_BELONG_HERE : undefined}
        primaryAction={
          !isEditing && (
            <button
              type="button"
              ref={editButtonRef}
              onClick={handleEdit}
              className="font-sans text-sm font-medium text-muted transition-colors hover:text-body"
            >
              {currentNeeds ? "Edit Current Needs" : "Add Current Needs"}
            </button>
          )
        }
      />

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
          <div
            id={helperId}
            className="mb-3 max-w-2xl space-y-2 rounded-lg border border-ivory-border bg-ivory px-4 py-3"
          >
            <p className="font-sans text-sm text-subtle">
              Keep this current. Include the resident&apos;s ongoing needs,
              important routines, care-related preferences, and safety
              considerations.
            </p>
            <p className="font-sans text-sm text-subtle">
              Update this when the resident&apos;s needs or care
              expectations change.
            </p>
            <p className="font-sans text-sm text-subtle">
              Use{" "}
              <a
                href="#working-notes"
                className="font-medium text-navy underline-offset-2 hover:underline"
              >
                Working Notes
              </a>{" "}
              for temporary or pending items.
            </p>
            <p className="font-sans text-sm text-subtle">
              <a
                href="#timeline"
                className="font-medium text-navy underline-offset-2 hover:underline"
              >
                Timeline
              </a>{" "}
              records important events and completed actions.
            </p>
          </div>

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
            No current needs documented yet.
          </p>
          <p className="mt-1.5 font-sans text-sm text-subtle">
            Add the ongoing needs, routines, preferences, or safety
            information Serve staff should know.
          </p>
          <p className="mt-2 font-sans text-sm text-subtle">
            Medication reminders · Mobility support · Meal escort · Safety
            considerations
          </p>
        </div>
      )}
    </div>
  );
}
