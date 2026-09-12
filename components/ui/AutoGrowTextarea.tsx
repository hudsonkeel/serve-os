"use client";

import { TextareaHTMLAttributes, useEffect, useRef } from "react";

// Incident Corrective Action Lifecycle v0.1 — the shared auto-growing
// textarea every substantive QAPI narrative field uses (review findings,
// corrective-action finding/action plan, effectiveness success criteria/
// evidence, follow-up update body). No fixed `rows` scroll box for prose
// that's meant to be read, per the "never present tiny fixed-height
// scrolling text boxes for substantive narratives" requirement — starts at
// `minRows` and grows with content, never shrinks below it.
//
// Plain resize-on-input via scrollHeight, no dependency — this codebase's
// other textareas (QapiDomainNoteEditor, ReviewIncidentForm, etc.) are all
// fixed-`rows` today; this is the first auto-growing one and is meant to
// become the one every subsequent narrative field in this app reaches for.
export interface AutoGrowTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> {
  minRows?: number;
}

const fieldClassName =
  "w-full resize-none overflow-hidden rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";

export function AutoGrowTextarea({ minRows = 3, className, value, onChange, ...props }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={onChange}
      className={[fieldClassName, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
