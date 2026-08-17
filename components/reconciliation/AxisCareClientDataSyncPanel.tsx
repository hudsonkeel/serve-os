"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { runAxisCareClientDataSyncNow, dismissAxisCareCanonicalConflict } from "@/lib/actions/axiscareClientSync";
import type { AxisCareClientSyncRun } from "@/lib/data/axiscareClientSyncRuns";
import type { UnresolvedConflictWithResident } from "@/lib/data/axiscareClientSync";
import type { BulkSyncSummary } from "@/lib/data/axiscareClientSync";
import { Badge } from "@/components/ui/Badge";

function compactDateTime(iso: string | null) {
  if (!iso) return "Never run yet";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_LABEL: Record<AxisCareClientSyncRun["status"], string> = {
  in_progress: "In Progress",
  success: "Success",
  partial: "Partial — Some Conflicts or Failures",
  failed: "Failed",
};

const STATUS_TONE: Record<AxisCareClientSyncRun["status"], "success" | "warning" | "danger" | "neutral"> = {
  in_progress: "neutral",
  success: "success",
  partial: "warning",
  failed: "danger",
};

interface AxisCareClientDataSyncPanelProps {
  canAct: boolean;
  lastRun: AxisCareClientSyncRun | null;
  lastSuccessfulRun: AxisCareClientSyncRun | null;
  conflicts: UnresolvedConflictWithResident[];
}

export function AxisCareClientDataSyncPanel({ canAct, lastRun, lastSuccessfulRun, conflicts }: AxisCareClientDataSyncPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justRanSummary, setJustRanSummary] = useState<BulkSyncSummary | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissNote, setDismissNote] = useState("");

  function handleSyncNow() {
    setError(null);
    setJustRanSummary(null);
    startTransition(async () => {
      const result = await runAxisCareClientDataSyncNow();
      if (result.error) {
        setError(result.error);
        return;
      }
      setJustRanSummary(result.summary ?? null);
      router.refresh();
    });
  }

  function handleDismiss(snapshotId: string) {
    if (!dismissNote.trim()) {
      setError("A note is required to dismiss a conflict.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await dismissAxisCareCanonicalConflict(snapshotId, dismissNote.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      setDismissingId(null);
      setDismissNote("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-sans text-card-title font-semibold text-body">AxisCare Client Data</h2>
          <p className="mt-1 font-sans text-sm text-muted">
            Keeps confirmed clients&rsquo; canonical facts (gender, address, admission date) and triage evidence current
            from AxisCare — gap-fill only, never overwrites a Serve-owned value.
          </p>
        </div>
        {canAct && (
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isPending}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-navy px-5 font-sans text-button font-semibold text-white transition-colors hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Syncing…" : "Sync Now"}
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-ivory-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Last Successful Sync</p>
          <p className="mt-0.5 font-sans text-sm text-body">{compactDateTime(lastSuccessfulRun?.completed_at ?? null)}</p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Current / Last Status</p>
          <p className="mt-0.5">
            {lastRun ? <Badge tone={STATUS_TONE[lastRun.status]}>{STATUS_LABEL[lastRun.status]}</Badge> : <span className="font-sans text-sm text-muted">Never run</span>}
          </p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Synchronized</p>
          <p className="mt-0.5 font-sans text-sm text-body">{lastRun ? lastRun.residents_succeeded : "-"}</p>
        </div>
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Conflicts / Failures</p>
          <p className="mt-0.5 font-sans text-sm text-body">
            {lastRun ? `${lastRun.residents_conflicted} / ${lastRun.residents_failed}` : "-"}
          </p>
        </div>
      </div>

      {justRanSummary && (
        <p className="mt-4 rounded-lg border border-ivory-border bg-ivory px-3 py-2 font-sans text-sm text-body">
          Sync complete — {justRanSummary.succeeded} synchronized, {justRanSummary.conflicted} with conflicts,{" "}
          {justRanSummary.failed} failed, {justRanSummary.skipped} skipped (retired duplicates or unconfirmed).
        </p>
      )}
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm text-red-600">{error}</p>}

      {conflicts.length > 0 && (
        <div className="mt-4 border-t border-ivory-border pt-4">
          <p className="mb-2 font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Conflicts Requiring Review · {conflicts.length}
          </p>
          <div className="space-y-2">
            {conflicts.map(({ snapshot, residentId, residentName }) => (
              <div key={snapshot.id} className="rounded-lg border border-amber-200 bg-warning-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-sans text-sm font-semibold text-body">{residentName ?? "Unknown resident"}</p>
                  {residentId && (
                    <Link href={`/residents/${residentId}`} className="font-sans text-sm font-medium text-navy hover:text-navy-light">
                      Review on resident profile →
                    </Link>
                  )}
                </div>
                <p className="mt-1 font-sans text-sm text-body">{snapshot.conflict_notes}</p>
                <p className="mt-1 font-sans text-xs text-muted">Serve&rsquo;s value remains authoritative until reviewed.</p>

                {canAct && (
                  <div className="mt-2">
                    {dismissingId === snapshot.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={dismissNote}
                          onChange={(e) => setDismissNote(e.target.value)}
                          rows={2}
                          placeholder="What did you confirm? (required)"
                          className="w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleDismiss(snapshot.id)}
                            className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
                          >
                            Confirm Reviewed
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDismissingId(null);
                              setDismissNote("");
                            }}
                            className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted hover:bg-ivory"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDismissingId(snapshot.id)}
                        className="font-sans text-sm font-medium text-navy hover:text-navy-light"
                      >
                        Mark Reviewed
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
