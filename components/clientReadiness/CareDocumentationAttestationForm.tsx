"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordCareDocumentationAttestationAction } from "@/lib/actions/clientReadiness";

// Verify From Source over AxisCare — the current, unsynced operational
// source for care/task documentation. Serve OS owns and evaluates this
// requirement even though the underlying notes live in AxisCare. No
// invented cadence — non-expiring until re-attested.
export function CareDocumentationAttestationForm({ residentId }: { residentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [verifiedThroughDate, setVerifiedThroughDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await recordCareDocumentationAttestationAction({
        residentId,
        verifiedThroughDate,
        notes: notes.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setNotes("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-navy px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-navy-light"
      >
        Verify From Source
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-80 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      <p className="font-sans text-xs text-body">Confirm required care/service documentation reviewed in AxisCare.</p>
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Verified Through</span>
        <input
          type="date"
          value={verifiedThroughDate}
          onChange={(e) => setVerifiedThroughDate(e.target.value)}
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
