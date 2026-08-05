"use client";

import { Sparkles } from "lucide-react";
import type { AskServeContext } from "@/lib/askServe/types";
import { useAskServe } from "./AskServeProvider";

interface AskServeTriggerProps {
  context: AskServeContext;
  label: string;
  className?: string;
}

// The one reusable Ask Serve entry point — used both by the persistent
// sidebar utility control and by contextual per-page buttons (see
// app/residents/page.tsx and app/residents/[id]/page.tsx). Always opens the
// panel over the current page; never navigates away.
export function AskServeTrigger({ context, label, className }: AskServeTriggerProps) {
  const { open } = useAskServe();

  return (
    <button
      type="button"
      onClick={() => open(context)}
      className={
        className ??
        "inline-flex h-10 items-center gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3.5 font-sans text-sm font-medium text-navy transition-colors hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
      }
    >
      <Sparkles size={15} strokeWidth={1.5} className="shrink-0 text-gold-dark" />
      {label}
    </button>
  );
}
