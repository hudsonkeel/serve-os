"use client";

// Community Roster Import + Reconciliation phase, Pass 3 — Finalize
// Import. Match/Create/Reject decisions are already durable the moment a
// human makes them (Pass 2); this is NOT a second application of those
// decisions. It closes out the review session: computes the run's final
// status from whatever review_state every row has already reached, and
// reports an honest completion summary — partial finalization (rows
// still pending/deferred) is explicitly allowed, never blocked.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finalizeCommunityRosterImport, cancelCommunityRosterImport } from "@/lib/actions/communityRosterImport";

interface RosterFinalizeControlProps {
  runId: string;
  committedCount: number;
  invalidCount: number;
  deferredCount: number;
  pendingCount: number;
  canCancel: boolean;
}

export function RosterFinalizeControl({ runId, committedCount, invalidCount, deferredCount, pendingCount, canCancel }: RosterFinalizeControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const stillOpen = pendingCount + deferredCount;

  function finalize() {
    setMessage(null);
    startTransition(async () => {
      const result = await finalizeCommunityRosterImport(runId);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({
        type: "success",
        text:
          result.status === "committed"
            ? `Finalized. ${result.committedCount} row${result.committedCount === 1 ? "" : "s"} resolved.`
            : `Finalized as partially committed. ${result.committedCount} resolved, ${(result.pendingCount ?? 0) + (result.deferredCount ?? 0)} still open — you can come back and finalize again once more rows are decided.`,
      });
      router.refresh();
    });
  }

  function cancel() {
    if (!window.confirm("Discard this import entirely? Nothing has been confirmed or created yet, so this is safe — the uploaded file and all analysis will be deleted.")) return;
    setMessage(null);
    startTransition(async () => {
      const result = await cancelCommunityRosterImport(runId);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      router.push("/residents/roster-import");
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <p className="font-sans text-sm font-semibold uppercase tracking-wide text-subtle">Finalize Import</p>
      <p className="mt-1 font-sans text-sm text-muted">
        {committedCount} resolved · {invalidCount} invalid · {deferredCount} deferred · {pendingCount} still pending review
      </p>
      <p className="mt-2 font-sans text-xs text-muted">
        Every match, creation, or rejection above is already durable — Finalize does not re-apply anything. It closes out this review
        session and records its final status.
        {stillOpen > 0 && " Finalizing now is a partial finalization — the rows still open remain reviewable afterward."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={finalize}
          className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Working…" : stillOpen > 0 ? "Finalize (Partial)" : "Finalize Import"}
        </button>
        {canCancel && (
          <button
            type="button"
            disabled={isPending}
            onClick={cancel}
            className="rounded-lg border border-ivory-border bg-surface px-4 py-2 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
          >
            Cancel Import
          </button>
        )}
      </div>
      {message?.type === "success" && <p className="mt-2 font-sans text-sm text-success-text">{message.text}</p>}
      {message?.type === "error" && <p className="mt-2 font-sans text-sm text-danger-text">{message.text}</p>}
    </div>
  );
}
