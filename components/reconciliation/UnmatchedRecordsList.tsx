"use client";

import { useState, useTransition } from "react";
import { AxisCareClientRow } from "@/components/peopleWeServe/AxisCareClientRow";
import { QuickExcludeButton } from "./QuickExcludeButton";
import { MatchToExistingPersonControl } from "./MatchToExistingPersonControl";
import { CreateNewResidentControl } from "./CreateNewResidentControl";
import { bulkExcludeAxisCareRecords } from "@/lib/actions/reconciliation";
import { buildReconciliationAnchorId } from "@/lib/reconciliation/anchor";
import type { AxisCareClientOperationalRow } from "@/lib/data/axiscareClientOperationalSummary";

// Orphan AxisCare records — no canonical Serve person identified yet.
// This is the one class of record that genuinely needs a standalone
// data-quality surface (per "resolution follows the person" — an
// entity-bound issue belongs on that person's record; an orphan record
// has no person to belong to yet). Checkbox selection + one confirm step
// for bulk exclusion of the obviously-irrelevant ones. Per-row "Match to
// Existing Person" (MatchToExistingPersonControl) handles the common
// case — a real person already in Serve, just not yet linked — leaving
// Exclude for records that genuinely aren't a Serve relationship at all.
interface UnmatchedRecordsListProps {
  rows: AxisCareClientOperationalRow[];
  canAct: boolean;
}

export function UnmatchedRecordsList({ rows, canAct }: UnmatchedRecordsListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [rationale, setRationale] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  function toggle(axiscareId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(axiscareId)) next.delete(axiscareId);
      else next.add(axiscareId);
      return next;
    });
  }

  function handleBulkExclude() {
    setMessage(null);
    startTransition(async () => {
      const result = await bulkExcludeAxisCareRecords(Array.from(selected), rationale.trim() || undefined);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setMessage({ type: "success", text: `Excluded ${result.excludedCount ?? selected.size} record(s).` });
      setSelected(new Set());
      setConfirming(false);
      setRationale("");
    });
  }

  return (
    <div>
      {canAct && selected.size > 0 && (
        <div className="mb-3 rounded-xl border border-ivory-border bg-ivory-warm p-4">
          {!confirming ? (
            <div className="flex items-center justify-between">
              <p className="font-sans text-sm font-medium text-body">{selected.size} selected</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light"
                >
                  Exclude Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-sans text-sm font-medium text-body">
                Exclude {selected.size} record{selected.size === 1 ? "" : "s"}?
              </p>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={1}
                placeholder="Rationale (optional, applies to all selected)"
                className="w-full rounded-lg border border-ivory-border bg-surface px-3 py-2 font-sans text-sm text-body outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleBulkExclude}
                  className="rounded-lg bg-navy px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-50"
                >
                  {isPending ? "Excluding…" : `Confirm: Exclude ${selected.size}`}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-ivory-border bg-surface px-3 py-1.5 font-sans text-sm font-medium text-muted transition-colors hover:bg-ivory disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {message && (
            <p className={`mt-2 font-sans text-sm ${message.type === "error" ? "text-danger-text" : "text-success-text"}`}>
              {message.text}
            </p>
          )}
        </div>
      )}

      <div className="divide-y divide-ivory-border">
        {rows.map((row) => (
          <div
            key={row.axiscareId}
            id={buildReconciliationAnchorId("axiscare", row.axiscareId)}
            className="flex scroll-mt-4 items-start gap-3 px-4 py-2 target:bg-gold/5 target:ring-2 target:ring-inset target:ring-gold/40"
          >
            {canAct && (
              <input
                type="checkbox"
                checked={selected.has(row.axiscareId)}
                onChange={() => toggle(row.axiscareId)}
                className="mt-8"
                aria-label={`Select ${row.name || row.axiscareId}`}
              />
            )}
            <div className="min-w-0 flex-1">
              <AxisCareClientRow row={row} />
              {canAct && (
                <div className="-mt-3 flex flex-wrap items-start gap-2 px-6 pb-4">
                  <MatchToExistingPersonControl
                    axiscareId={row.axiscareId}
                    vendorDisplayName={row.name}
                    statusLabel={row.statusLabel}
                    statusActive={row.statusActive}
                    classes={[...row.classes]}
                    suggestedMatches={[...row.suggestedMatches]}
                    resolvedCommunityId={row.resolvedCommunityId}
                    resolvedCommunityName={row.resolvedCommunityName}
                  />
                  <CreateNewResidentControl
                    axiscareId={row.axiscareId}
                    vendorDisplayName={row.name}
                    firstName={row.firstName}
                    lastName={row.lastName}
                    classes={[...row.classes]}
                    resolvedCommunityId={row.resolvedCommunityId}
                    resolvedCommunityName={row.resolvedCommunityName}
                  />
                  <QuickExcludeButton axiscareId={row.axiscareId} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
