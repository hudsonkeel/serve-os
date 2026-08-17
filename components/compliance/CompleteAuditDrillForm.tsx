"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeAuditSessionAction } from "@/lib/actions/auditReadiness";

export interface AuditDrillReviewSummary {
  totalItems: number;
  subjectCount: number;
  passCount: number;
  failCount: number;
  evidenceMissingCount: number;
  needsReviewCount: number;
  openFollowUpCount: number;
}

// The review-and-lock step: before this audit becomes immutable, the
// auditor sees what they actually reviewed — not just a warning sentence.
export function CompleteAuditDrillForm({ sessionId, summary: review }: { sessionId: string; summary: AuditDrillReviewSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [confirming, setConfirming] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await completeAuditSessionAction({ sessionId, summary: summary.trim() || null });
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
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className="mt-1 w-full max-w-xl rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body focus:border-navy/30 focus:outline-none"
        />
      </label>

      {error && <p className="font-sans text-xs text-red-600">{error}</p>}

      {confirming && (
        <div className="rounded-lg border border-warning-text/30 bg-warning-surface p-3">
          <p className="font-sans text-sm text-body">
            {review.totalItems} requirement{review.totalItems === 1 ? "" : "s"} reviewed across {review.subjectCount}{" "}
            {review.subjectCount === 1 ? "person" : "people"} — {review.passCount} pass
            {review.failCount > 0 && `, ${review.failCount} fail`}
            {review.evidenceMissingCount > 0 && `, ${review.evidenceMissingCount} evidence missing`}
            {review.needsReviewCount > 0 && `, ${review.needsReviewCount} needs review`}
            {review.openFollowUpCount > 0 && ` — ${review.openFollowUpCount} follow-up item${review.openFollowUpCount === 1 ? "" : "s"} still open`}
            .
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
          {isPending ? "Completing…" : confirming ? "Confirm Complete Audit" : "Complete Audit"}
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
