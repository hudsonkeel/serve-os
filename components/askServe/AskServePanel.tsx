"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { KNOWLEDGE_PROFILE_COPY } from "@/lib/askServe/knowledgeProfiles";
import { useAskServe } from "./AskServeProvider";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Right-side slide-over on desktop, full-height bottom sheet on narrow
// viewports (sm breakpoint). No modal/drawer primitive existed anywhere in
// this repo before this component — portal, backdrop, Escape handling, and
// a focus trap are all built here from scratch, deliberately kept small
// rather than a generalized "Dialog" system (see "Avoid premature
// abstraction" in docs/architecture/ASK_SERVE_ARCHITECTURE.md).
export function AskServePanel() {
  const { isOpen, context, close } = useAskServe();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusableEls = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
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
  }, [isOpen, close]);

  if (!isOpen || !context) return null;

  const copy = KNOWLEDGE_PROFILE_COPY[context.knowledgeProfile ?? "general"];

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end sm:items-stretch">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-navy-deep/40"
        aria-hidden="true"
        onClick={close}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={copy.heading}
        className="relative flex h-full w-full flex-col overflow-y-auto border-l border-ivory-border bg-surface shadow-card-hover sm:w-[420px] sm:max-w-[90vw]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ivory-border px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy">
              <Sparkles size={18} strokeWidth={1.5} className="text-gold" />
            </div>
            <div>
              <h2 className="font-serif text-card-title font-light text-body">{copy.heading}</h2>
              {context.subjectLabel && (
                <p className="mt-0.5 font-sans text-sm text-muted">{context.subjectLabel}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close Ask Serve"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-ivory hover:text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 space-y-6 px-6 py-6">
          <p className="font-sans text-sm text-body">{copy.description}</p>

          <div className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
            <p className="font-sans text-sm font-medium text-gold-dark">Contextual answers are not connected yet.</p>
          </div>

          <div>
            <p className="mb-3 font-sans text-[10px] font-semibold uppercase tracking-widest text-muted">
              Example questions
            </p>
            <div className="space-y-2">
              {copy.exampleQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled
                  className="w-full cursor-default rounded-lg border border-ivory-border bg-ivory px-4 py-3 text-left font-sans text-sm text-body"
                >
                  <span className="mr-2 text-gold">→</span>
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-ivory-border px-6 py-4">
          <LinkButton href="/ask-serve" size="small" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
            Open full Ask Serve →
          </LinkButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
