"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { NotebookPen, X, Check } from "lucide-react";
import { createWorkingNote } from "@/lib/actions/residentWorkingNotes";
import { WORKING_NOTE_MAX_LENGTH } from "@/lib/residentWorkingNotes/validation";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface QuickNoteButtonProps {
  residentId: string;
  residentDisplayName: string;
  /** Overrides the trigger button's own classes (e.g. to sit as an
   * equal-width sibling next to AssessmentCaptureButton in the person
   * header) — everything else about the component is unchanged. */
  className?: string;
}

// A fast, person-level capture path for the SAME underlying model the full
// "Working Notes" section (ResidentWorkingNotes.tsx, further down this
// page) already uses — createWorkingNote(), the same server action, same
// resident_working_notes table, same author/timestamp/status fields.
// Nothing new is invented here: this is a lighter-weight ENTRY POINT into
// existing, already-permissioned, already-audited functionality, not a
// parallel notes system. Category is deliberately omitted (normalizes to
// null, exactly like the full form's "No category" option) — the point of
// Quick Note is "type → Save" in a few seconds, not a form.
//
// "Needs follow-up": a new note is always created with status "open" (the
// same field the full Working Notes section already uses to separate
// Active from Resolved) — that IS the follow-up marker. No second boolean
// was added; an open note already means "still needs attention" and
// already has a Resolve action once someone gets to it.
//
// Overlay pattern mirrors AskServePanel.tsx exactly (portal, backdrop,
// focus trap, Escape) — the only modal primitive already proven in this
// repo, reused rather than a third one invented.
export function QuickNoteButton({ residentId, residentDisplayName, className }: QuickNoteButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  function requestClose() {
    // Prevent accidental loss — only prompts when there's real unsaved
    // content; closing an empty composer never nags.
    if (content.trim().length > 0 && !justSaved) {
      const discard = window.confirm("Discard this note?");
      if (!discard) return;
    }
    setIsOpen(false);
    setContent("");
    setError(null);
    setJustSaved(false);
  }

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Autofocus straight into the text field — the whole point is
    // type-then-save with no intermediate step.
    textareaRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusableEls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusableEls.length === 0) return;
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleSave() {
    setError(null);
    startSaveTransition(async () => {
      const result = await createWorkingNote({ residentId, content, category: "" });
      if (result.error) {
        setError(result.error);
        return;
      }
      // Immediate saved feedback before returning to the record — the new
      // note doesn't scroll into view on its own (Working Notes is further
      // down the page), so this confirms it landed without making the
      // user go look for it.
      setJustSaved(true);
      router.refresh();
      setTimeout(() => {
        setIsOpen(false);
        setContent("");
        setJustSaved(false);
      }, 900);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          className ??
          "flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-navy/20 bg-surface px-4 font-sans text-button font-medium text-navy shadow-card"
        }
      >
        <NotebookPen size={17} strokeWidth={1.75} />
        Add Note
      </button>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <div className="fixed inset-0 bg-navy-deep/40" aria-hidden="true" onClick={requestClose} />

            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={`Add note for ${residentDisplayName}`}
              className="relative flex w-full flex-col rounded-t-2xl border border-ivory-border bg-surface shadow-card-hover sm:w-[480px] sm:max-w-[90vw] sm:rounded-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-ivory-border px-5 py-4">
                <div>
                  <h2 className="font-serif text-card-title font-light text-body">Add Note</h2>
                  <p className="mt-0.5 font-sans text-sm text-muted">{residentDisplayName}</p>
                </div>
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Close"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-ivory hover:text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              {justSaved ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success-surface text-success-text">
                    <Check size={20} strokeWidth={2} />
                  </div>
                  <p className="font-sans text-base font-medium text-body">Note saved</p>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={WORKING_NOTE_MAX_LENGTH}
                    rows={5}
                    placeholder="What should we remember? e.g. &ldquo;Daughter mentioned Dad's been more forgetful lately&rdquo;"
                    className="w-full rounded-lg border border-ivory-border bg-ivory px-4 py-3 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
                  />

                  {error && (
                    <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">
                      {error}
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-sans text-sm text-subtle">
                      {WORKING_NOTE_MAX_LENGTH - content.length} characters remaining
                    </span>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || content.trim().length === 0}
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-navy px-6 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
