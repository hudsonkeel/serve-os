"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkButton } from "@/components/ui/Button";
import { runAxisCareClientDataSyncNow } from "@/lib/actions/axiscareClientSync";
import { keepServeConflictValue, adoptAxisCareConflictValue } from "@/lib/actions/axiscareCanonicalConflicts";
import type { AxisCareClientSyncRun } from "@/lib/data/axiscareClientSyncRuns";
import type { UnresolvedConflictWithResident } from "@/lib/data/axiscareClientSync";
import type { BulkSyncSummary } from "@/lib/data/axiscareClientSync";
import type { FieldConflictSummary, BootstrapFieldName } from "@/lib/integrations/axiscare/clientCanonicalReconciliation";
import { Badge } from "@/components/ui/Badge";

function compactDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const FAMILY_CONTACT_FIELDS = new Set<BootstrapFieldName>([
  "family_contact_name",
  "family_contact_relationship",
  "family_contact_phone",
  "family_contact_email",
]);

// One field's WHAT/WHY/DO/DONE. Self-contained so each field within a
// multi-field conflict (e.g. Michele Helsley: name AND phone) resolves
// independently — reviewing one must never affect the other's own
// pending state or hide it.
function FieldConflictRow({ snapshotId, residentId, conflict }: { snapshotId: string; residentId: string; conflict: FieldConflictSummary }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function handleKeepServe() {
    setError(null);
    startTransition(async () => {
      const result = await keepServeConflictValue(snapshotId, residentId, conflict.field);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone("Kept Serve's value. This won't re-alert unless AxisCare's value changes again.");
      router.refresh();
    });
  }

  function handleUseAxisCare() {
    setError(null);
    startTransition(async () => {
      const result = await adoptAxisCareConflictValue(snapshotId, residentId, conflict.field);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone("Adopted AxisCare's value into Serve.");
      router.refresh();
    });
  }

  const editHref = FAMILY_CONTACT_FIELDS.has(conflict.field)
    ? `/residents/${residentId}?editSection=family_contact`
    : `/residents/${residentId}`;

  if (done) {
    return (
      <div className="rounded-lg border border-ivory-border bg-surface px-3 py-2">
        <p className="font-sans text-sm font-medium text-body">{conflict.label}</p>
        <p className="mt-0.5 font-sans text-sm text-success-text">{done}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ivory-border bg-surface px-3 py-2.5">
      <p className="font-sans text-sm font-semibold text-body">{conflict.label}</p>
      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-ivory-border bg-ivory px-2.5 py-1.5">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Serve</p>
          <p className="mt-0.5 font-sans text-sm text-body">{conflict.serveValue || "—"}</p>
        </div>
        <div className="rounded-md border border-ivory-border bg-ivory px-2.5 py-1.5">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">AxisCare</p>
          <p className="mt-0.5 font-sans text-sm text-body">{conflict.axiscareValue || "—"}</p>
          <p className="mt-0.5 font-sans text-xs text-muted">Observed {compactDate(conflict.axiscareObservedAt)}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleKeepServe}
          className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white hover:bg-navy-light disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Keep Serve"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleUseAxisCare}
          className="rounded-lg border border-navy/30 bg-surface px-3 py-1.5 font-sans text-sm font-medium text-navy hover:bg-ivory-warm disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Use AxisCare"}
        </button>
        <LinkButton href={editHref} size="small">
          Edit →
        </LinkButton>
      </div>
      {error && <p className="mt-1.5 font-sans text-sm text-danger-text">{error}</p>}
    </div>
  );
}

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
            Conflicts Requiring Review · {conflicts.reduce((n, c) => n + c.fieldConflicts.length, 0)}
          </p>
          <div className="space-y-3">
            {conflicts.map(({ snapshot, residentId, residentName, fieldConflicts }) => (
              <div key={snapshot.id} className="rounded-lg border border-amber-200 bg-warning-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-sans text-sm font-semibold text-body">{residentName ?? "Unknown resident"}</p>
                  {residentId && (
                    <LinkButton href={`/residents/${residentId}`} size="small">
                      View resident profile →
                    </LinkButton>
                  )}
                </div>
                <p className="mt-1 font-sans text-xs text-muted">
                  Serve&rsquo;s value remains authoritative on every field below until reviewed.
                </p>

                {fieldConflicts.length === 0 ? (
                  <p className="mt-2 font-sans text-sm text-muted">
                    No fields currently differ — this record will drop off the next time this list refreshes.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {fieldConflicts.map((conflict) =>
                      canAct && residentId ? (
                        <FieldConflictRow key={conflict.field} snapshotId={snapshot.id} residentId={residentId} conflict={conflict} />
                      ) : (
                        <div key={conflict.field} className="rounded-lg border border-ivory-border bg-surface px-3 py-2">
                          <p className="font-sans text-sm font-semibold text-body">{conflict.label}</p>
                          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="rounded-md border border-ivory-border bg-ivory px-2.5 py-1.5">
                              <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Serve</p>
                              <p className="mt-0.5 font-sans text-sm text-body">{conflict.serveValue || "—"}</p>
                            </div>
                            <div className="rounded-md border border-ivory-border bg-ivory px-2.5 py-1.5">
                              <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">AxisCare</p>
                              <p className="mt-0.5 font-sans text-sm text-body">{conflict.axiscareValue || "—"}</p>
                            </div>
                          </div>
                        </div>
                      )
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
