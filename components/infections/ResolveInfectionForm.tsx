"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveInfectionAction } from "@/lib/actions/infections";

const MIN_NOTE_LENGTH = 10;

// Mirrors components/incidents/ResolveIncidentForm.tsx exactly. Only
// reachable once the infection record is reviewed; the RPC itself would
// reject it otherwise (infections_resolve_requires_review_check). Never
// edits the original disclosed facts — only closes the record with its
// own note.
export function ResolveInfectionForm({ infectionId }: { infectionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (resolutionNote.trim().length < MIN_NOTE_LENGTH) {
      setError("Please provide a meaningful resolution note (what was done / why this is closed).");
      return;
    }

    startTransition(async () => {
      const res = await resolveInfectionAction({ infectionId, resolutionNote: resolutionNote.trim() });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Resolution Note
        </span>
        <textarea
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          rows={3}
          placeholder="What was done, and why this infection record is now closed."
          className="w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60"
        />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
      >
        {isPending ? "Resolving…" : "Resolve Infection Record"}
      </button>
    </form>
  );
}
