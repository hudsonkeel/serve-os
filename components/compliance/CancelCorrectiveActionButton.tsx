"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { cancelCorrectiveActionImplementationAction } from "@/lib/actions/correctiveActions";

// Incident Corrective Action Lifecycle v0.1 — the explicit, reasoned
// withdrawal path (design decision 4, 20260910000000): a cancellation
// always requires its own note and must never be confused with, or
// silently treated as equivalent to, a completed effectiveness
// verification. Mirrors ResolveCorrectiveActionButton's exact interaction
// pattern (compact affordance, expandable inline confirmation form).
// Domain-agnostic — lives in components/compliance/ so any QAPI domain
// sourcing rows into compliance_corrective_actions reuses it unchanged.
export function CancelCorrectiveActionButton({ actionId }: { actionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function handleSubmit() {
    if (!note.trim()) {
      setError("A cancellation reason is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await cancelCorrectiveActionImplementationAction({ actionId, cancellationNote: note.trim() });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
      >
        Cancel Action
      </button>
    );
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="w-80 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Why is this action being cancelled?</span>
        <AutoGrowTextarea value={note} onChange={(e) => setNote(e.target.value)} minRows={2} className="mt-0.5 text-xs" />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" size="small" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Saving…" : "Confirm Cancellation"}
        </Button>
        <Button
          type="button"
          size="small"
          disabled={isPending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Back
        </Button>
      </div>
    </form>
  );
}
