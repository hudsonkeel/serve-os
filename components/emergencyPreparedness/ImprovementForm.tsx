"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordEmergencyPreparednessImprovementAction } from "@/lib/actions/emergencyPreparedness";

// A separate affordance from requirement findings — never miscategorized as
// a compliance finding (item_kind: 'improvement', requirement_id null).
export function ImprovementForm({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await recordEmergencyPreparednessImprovementAction({
        reviewId,
        description: description.trim(),
        notes: notes.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setDescription("");
      setNotes("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-sans text-xs font-medium text-navy hover:text-navy-light"
      >
        + Suggest an improvement
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-96 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Improvement</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          required
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setOpen(false)}
          className="rounded-lg border border-ivory-border px-3 py-1.5 font-sans text-xs font-medium text-muted hover:border-navy/20"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
