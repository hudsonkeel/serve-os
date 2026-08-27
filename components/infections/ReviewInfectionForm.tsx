"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { markInfectionReviewedAction } from "@/lib/actions/infections";

const fieldClassName =
  "w-full rounded-md border border-ivory-border bg-surface px-3 py-2 font-sans text-base text-body outline-none placeholder:text-subtle focus:border-gold/60";

// Mirrors components/incidents/ReviewIncidentForm.tsx exactly — the formal
// review step, separate from the disclosed facts above it on the detail
// page. Never edits condition_description/treatment_description/etc.; it
// only records leadership's follow-up decision. No default — the RPC
// itself rejects a null follow-up decision.
export function ReviewInfectionForm({ infectionId }: { infectionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<"yes" | "no" | null>(null);
  const [owner, setOwner] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (followUp === null) {
      setError("Please indicate whether follow-up is required.");
      return;
    }
    if (followUp === "yes" && !owner.trim()) {
      setError("An owner is required when follow-up is required.");
      return;
    }

    startTransition(async () => {
      const res = await markInfectionReviewedAction({
        infectionId,
        followUpRequired: followUp === "yes",
        owner: followUp === "yes" ? owner.trim() : null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Is follow-up required?
        </span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 font-sans text-sm text-body">
            <input type="radio" name="followUp" checked={followUp === "yes"} onChange={() => setFollowUp("yes")} />
            Yes
          </label>
          <label className="flex items-center gap-2 font-sans text-sm text-body">
            <input type="radio" name="followUp" checked={followUp === "no"} onChange={() => setFollowUp("no")} />
            No
          </label>
        </div>
      </div>

      {followUp === "yes" && (
        <label className="block">
          <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Owner
          </span>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Who owns this follow-up?"
            className={fieldClassName}
          />
        </label>
      )}

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving…" : "Mark Reviewed"}
      </Button>
    </form>
  );
}
