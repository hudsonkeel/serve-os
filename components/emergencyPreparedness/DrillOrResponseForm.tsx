"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordEmergencyPreparednessDrillOrResponseAction } from "@/lib/actions/emergencyPreparedness";
import { FileUploadField } from "@/components/ui/FileUploadField";

// EP_ANNUAL_RESPONSE_DRILL's own evidence — a discrete event, recordable
// any time, never a reaffirmation of a prior artifact. Distinguishes the
// two P&P §256-named evidence types for explanation only.
export function DrillOrResponseForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"planned_drill" | "actual_emergency_response">("planned_drill");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("occurredAt", occurredAt);
      if (notes.trim()) formData.set("notes", notes.trim());
      if (file) formData.set("file", file);

      const res = await recordEmergencyPreparednessDrillOrResponseAction(formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setNotes("");
      setFile(null);
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
        Record Drill or Response
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-80 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Type</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        >
          <option value="planned_drill">Planned Communication Tree Drill</option>
          <option value="actual_emergency_response">Qualifying Actual Emergency Response</option>
        </select>
      </label>

      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Date</span>
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          required
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <FileUploadField label="Supporting document (optional, PDF)" accept="application/pdf" value={file} onChange={setFile} />

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
