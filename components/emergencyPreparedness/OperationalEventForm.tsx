"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordAgencyOperationalEventAction } from "@/lib/actions/emergencyPreparedness";

// A real triggering-event record for EP_HHS_NOTIFICATION's applicability —
// never evidence-absence. Recording this is what moves the requirement from
// not_applicable into an evaluable state.
export function OperationalEventForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState<"agency_temporary_relocation" | "agency_service_area_expansion">(
    "agency_temporary_relocation"
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await recordAgencyOperationalEventAction({
        eventType,
        eventTitle: title.trim(),
        eventDescription: description.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setTitle("");
      setDescription("");
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
        Record a temporary relocation or service-area expansion →
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-96 space-y-2 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Event Type</span>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value as typeof eventType)}
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        >
          <option value="agency_temporary_relocation">Temporary Office Relocation</option>
          <option value="agency_service_area_expansion">Temporary Service-Area Expansion</option>
        </select>
      </label>

      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="mt-0.5 w-full rounded-lg border border-ivory-border bg-surface px-2.5 py-1.5 font-sans text-xs text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="font-sans text-[11px] font-medium text-muted">Description (optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
