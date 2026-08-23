"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import { AddWellnessNoteForm } from "./AddWellnessNoteForm";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface WellnessQuickActionButtonProps {
  residentId: string;
  residentDisplayName: string;
  icon: LucideIcon;
  label: string;
  className?: string;
}

// Same portal/backdrop/focus-trap chrome as QuickNoteButton.tsx (the one
// proven modal-launcher pattern in this repo) around the SAME
// AddWellnessNoteForm every wellness observation in this codebase already
// goes through — no second capture mechanism. AddWellnessNoteForm's own
// defaultOpen/onSaved props exist specifically for this kind of launcher
// (see WellnessObservationQuickAction.tsx, the mobile person-picker
// equivalent of this same pattern).
//
// Reused for two Work With This Person strip entries ("Record Wellbeing
// Observation" and "Record Significant Change") with different labels —
// both lead to the identical, comprehensive wellness-signal form (which
// already covers change-in-service-need, hospital/rehab, and every other
// "something changed" signal alongside routine observations). There is
// no separate lightweight "significant change" capture model in this
// codebase to reuse instead of duplicating; inventing one was out of
// scope for a composition pass.
export function WellnessQuickActionButton({ residentId, residentDisplayName, icon: Icon, label, className }: WellnessQuickActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  function close() {
    setIsOpen(false);
    setJustSaved(false);
  }

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
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
  }, [isOpen]);

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
        <Icon size={17} strokeWidth={1.75} />
        {label}
      </button>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <div className="fixed inset-0 bg-navy-deep/40" aria-hidden="true" onClick={close} />

            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={`${label} for ${residentDisplayName}`}
              className="relative flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-2xl border border-ivory-border bg-surface shadow-card-hover sm:w-[560px] sm:max-w-[90vw] sm:rounded-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-ivory-border px-5 py-4">
                <div>
                  <h2 className="font-serif text-card-title font-light text-body">{label}</h2>
                  <p className="mt-0.5 font-sans text-sm text-muted">{residentDisplayName}</p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-ivory hover:text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              <div className="px-5 py-4">
                {justSaved ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-sans text-sm text-emerald-700">
                    Saved. Closing…
                  </p>
                ) : (
                  <AddWellnessNoteForm
                    residentId={residentId}
                    defaultOpen
                    onSaved={() => {
                      setJustSaved(true);
                      setTimeout(close, 900);
                    }}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
