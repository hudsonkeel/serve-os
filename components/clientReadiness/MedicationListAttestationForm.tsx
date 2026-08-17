"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordMedicationListAttestationAction } from "@/lib/actions/clientReadiness";

// Verify From Source over the physical Serve folder in the client's
// apartment — Serve OS never transcribes the medication list itself.
// Tri-state: present / not applicable (confirmed no medications) — never a
// bare "verified" checkbox, and never an invented expiration.
export function MedicationListAttestationForm({ residentId }: { residentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"present" | "not_applicable">("present");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await recordMedicationListAttestationAction({
        residentId,
        outcome,
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
      <p className="font-sans text-xs text-body">Confirm the medication list in the client&apos;s physical Serve folder.</p>
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Verified</span>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as typeof outcome)}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        >
          <option value="present">Present in the folder</option>
          <option value="not_applicable">Not applicable — no medications</option>
        </select>
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
