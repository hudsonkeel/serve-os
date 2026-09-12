"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { resolveIncidentAction } from "@/lib/actions/incidents";

const MIN_NOTE_LENGTH = 10;

// Only reachable once the incident is reviewed — the detail page never
// renders this before then, and the RPC itself would reject it anyway
// (see incidents_resolve_requires_review_check). A resolution never edits
// the original factual record; it only closes the record out with its own
// note.
export function ResolveIncidentForm({ incidentId }: { incidentId: string }) {
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
      const res = await resolveIncidentAction({ incidentId, resolutionNote: resolutionNote.trim() });
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
        <AutoGrowTextarea
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          minRows={3}
          placeholder="What was done, and why this incident is now closed."
        />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Resolving…" : "Resolve Incident"}
      </Button>
    </form>
  );
}
