"use client";

import { useState, useTransition } from "react";
import { quickExcludeAxisCareRecord } from "@/lib/actions/reconciliation";

// The simplified, single-click front door onto the existing disposition
// mechanism — never asks the user to pick from the full 6-option
// taxonomy just to exclude an obviously irrelevant record. Rationale is
// optional from the user's perspective (a sensible default is
// substituted server-side); typing one is offered, never required.
interface QuickExcludeButtonProps {
  axiscareId: string;
  onExcluded?: () => void;
}

export function QuickExcludeButton({ axiscareId, onExcluded }: QuickExcludeButtonProps) {
  const [open, setOpen] = useState(false);
  const [rationale, setRationale] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExclude() {
    setError(null);
    startTransition(async () => {
      const result = await quickExcludeAxisCareRecord(axiscareId, rationale.trim() || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setRationale("");
      onExcluded?.();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-body transition-colors hover:bg-ivory"
      >
        Exclude
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-ivory-border bg-ivory p-3">
      <p className="font-sans text-sm font-medium text-body">Exclude this record?</p>
      <p className="font-sans text-xs text-muted">
        Marks it as reviewed and not a relevant Serve operational person/relationship. Suppressed from ordinary
        work, never deleted, and restorable any time from Excluded Records.
      </p>
      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={1}
        placeholder="Rationale (optional)"
        className="w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={handleExclude}
          className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Excluding…" : "Confirm: Exclude"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}
