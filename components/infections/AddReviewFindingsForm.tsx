"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { markInfectionReviewedAction } from "@/lib/actions/infections";

// Mirrors components/incidents/AddReviewFindingsForm.tsx exactly — the
// one-time legacy-backfill path. Linda Kaplan's real infection record was
// reviewed before review_findings existed on infections, so it has no way
// to receive them through ReviewInfectionForm, which only ever runs on the
// not-yet-reviewed path. This form re-affirms the infection's own existing
// follow_up_required/owner unchanged and supplies review_findings —
// mark_infection_reviewed accepts it exactly once, when the current value
// is null, without touching reviewed_by/reviewed_at.
export function AddReviewFindingsForm({
  infectionId,
  followUpRequired,
  owner,
}: {
  infectionId: string;
  followUpRequired: boolean;
  owner: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reviewFindings, setReviewFindings] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!reviewFindings.trim()) {
      setError("Please record the review findings.");
      return;
    }

    startTransition(async () => {
      const res = await markInfectionReviewedAction({
        infectionId,
        followUpRequired,
        owner,
        reviewFindings: reviewFindings.trim(),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-dashed border-ivory-border bg-ivory p-4">
      <p className="font-sans text-xs text-muted">
        This infection record was reviewed before findings were being recorded. Add them now — this can only be done once.
      </p>
      <label className="block">
        <span className="mb-1 block font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Review Findings
        </span>
        <AutoGrowTextarea
          value={reviewFindings}
          onChange={(e) => setReviewFindings(e.target.value)}
          minRows={3}
          placeholder="Why was follow-up necessary — or not necessary?"
        />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      <Button type="submit" variant="primary" disabled={isPending}>
        {isPending ? "Saving…" : "Save Review Findings"}
      </Button>
    </form>
  );
}
