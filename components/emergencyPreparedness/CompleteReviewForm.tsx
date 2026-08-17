"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeEmergencyPreparednessReviewAction } from "@/lib/actions/emergencyPreparedness";

export interface EmergencyPreparednessReviewSummary {
  findingCount: number;
  improvementCount: number;
  noChangeCount: number;
  updateCount: number;
  evidenceNeededCount: number;
  needsReviewCount: number;
}

// The review-and-lock step, mirroring CompleteAuditDrillForm's own
// discipline exactly: the reviewer sees what they actually reviewed before
// this becomes immutable.
export function CompleteReviewForm({ reviewId, summary }: { reviewId: string; summary: EmergencyPreparednessReviewSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await completeEmergencyPreparednessReviewAction({ reviewId, summary: text.trim() || null });
      if (res.error) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <label className="block">
        <span className="font-sans text-xs font-medium text-muted">Summary (optional)</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="mt-1 w-full max-w-xl rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      {confirming && (
        <div className="rounded-lg border border-warning-text/30 bg-warning-surface p-3">
          <p className="font-sans text-sm text-body">
            {summary.findingCount} requirement{summary.findingCount === 1 ? "" : "s"} reviewed
            {summary.improvementCount > 0 && `, ${summary.improvementCount} improvement${summary.improvementCount === 1 ? "" : "s"} suggested`}{" "}
            — {summary.noChangeCount} no change needed
            {summary.updateCount > 0 && `, ${summary.updateCount} updated`}
            {summary.evidenceNeededCount > 0 && `, ${summary.evidenceNeededCount} evidence needed`}
            {summary.needsReviewCount > 0 && `, ${summary.needsReviewCount} needs review`}.
          </p>
          <p className="mt-1 font-sans text-xs font-medium text-warning-text">
            This cannot be undone — every finding above becomes immutable. Submit again to confirm.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Completing…" : confirming ? "Confirm Complete Review" : "Complete Review"}
        </button>
        {confirming && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-ivory-border px-4 py-2 font-sans text-sm font-medium text-muted hover:border-navy/20"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
