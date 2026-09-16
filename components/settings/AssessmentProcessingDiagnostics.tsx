"use client";

import { useState, useTransition } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatCentralTimestamp } from "@/lib/utils/date";
import { getAssessmentProcessingDiagnostics } from "@/lib/actions/assessmentProcessingAdmin";
import type { ProcessingDiagnosticRow } from "@/lib/data/assessmentIntelligence";

// Admin/diagnostic-only table — not part of the normal assessor workflow (see
// AssessmentProcessingDispatchTrigger's header comment for why this section exists at all).
// Shows the furthest stage each in-flight session's most recent dispatch/claim attempt reached,
// so the next test can tell exactly where processing stopped without Netlify log access.
//
// Client component so "Refresh" can re-fetch just this table's data (via the
// getAssessmentProcessingDiagnostics server action, gated identically to app/settings/page.tsx's
// own canViewManagement check) without reloading the rest of Settings. No automatic polling --
// refresh is manual only, per an explicit decision to keep this slice's scope to UX, not a new
// standing background request cycle.

const STATUS_TONE: Record<string, BadgeTone> = {
  queued: "neutral",
  processing: "blue",
  failed: "danger",
};

// worker_wrapper_started / worker_wrapper_fetch_failed (and the paired wrapperFetchStatus field
// below) are retired as of the 2026-09-17 background-safe core split -- the same-site HTTP
// callback they diagnosed no longer exists (the background worker now calls the processing core
// directly, in-process), so no code path writes these anymore. Deliberately NOT in this map: a
// still-labeled entry would misleadingly suggest they're still meaningful going forward. A
// historical row from before this change still displays fine via the raw-string fallback below --
// harmless schema residue, not worth a migration to clean up (see supabase/migrations/
// 20260917010000_add_worker_wrapper_fetch_outcome_diagnostic_stages.sql's own comment).
const STAGE_LABELS: Record<string, string> = {
  dispatched: "Dispatcher submitted",
  invocation_accepted: "Netlify accepted invocation",
  worker_received: "Worker started (authenticated)",
  extraction_started: "Extraction started",
};

// Storage stays UTC everywhere -- this only ever affects display. See lib/utils/date.ts's
// formatCentralTimestamp() for the shared Central-Time (America/Chicago, DST-correct)
// formatter -- reused here rather than a one-off conversion local to this table.
function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return formatCentralTimestamp(iso) ?? "—";
}

// Not a secret -- intake_assessment_sessions.id is an ordinary UUID primary key, already visible
// in this admin-only view via the row itself. Shown truncated (with the full id on hover/title)
// purely so two rows for the same resident -- e.g. Margaret TESTson's two currently-queued
// sessions -- read as visibly distinct entries rather than identical-looking rows, which the
// resident name + status columns alone cannot do.
function shortSessionId(id: string): string {
  return id.slice(0, 8);
}

// A claimed 'processing' row (processing_claimed_at IS NOT NULL) is itself durable evidence the
// queued -> processing claim succeeded -- stronger evidence than any diagnostic-stage marker, so
// it's shown as its own line rather than overloading processing_diagnostic_stage's values.
function describeStage(row: ProcessingDiagnosticRow): string {
  if (row.status === "processing" && row.processingClaimedAt) {
    return "Claimed — processing";
  }
  if (row.processingDiagnosticStage) {
    // Falls back to the raw stage string for a retired value (worker_wrapper_started /
    // worker_wrapper_fetch_failed) on a historical row -- see STAGE_LABELS' own comment.
    return STAGE_LABELS[row.processingDiagnosticStage] ?? row.processingDiagnosticStage;
  }
  return row.status === "queued" ? "Not yet submitted" : "—";
}

export function AssessmentProcessingDiagnostics({
  initialRows,
  initialFetchedAt,
}: {
  initialRows: ProcessingDiagnosticRow[];
  initialFetchedAt: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [lastUpdated, setLastUpdated] = useState(initialFetchedAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await getAssessmentProcessingDiagnostics();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
      setLastUpdated(new Date().toISOString());
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex h-9 items-center rounded-lg border border-ivory-border bg-ivory px-4 font-sans text-sm font-semibold text-body transition-colors hover:bg-white disabled:opacity-50"
        >
          {isPending ? "Refreshing…" : "Refresh"}
        </button>
        <p className="font-sans text-sm text-muted">Last updated {formatTimestamp(lastUpdated)}</p>
      </div>

      {error && <p className="mb-2 font-sans text-sm text-danger-text">{error}</p>}

      {rows.length === 0 ? (
        <p className="font-sans text-sm text-muted">
          No sessions are currently queued, processing, or failed.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] font-sans text-sm">
            <thead>
              <tr className="border-b border-ivory-border text-left text-label font-semibold uppercase tracking-widest text-muted">
                <th className="pb-2 pr-4">Client</th>
                <th className="pb-2 pr-4">Session</th>
                <th className="pb-2 pr-4">Started</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Furthest stage reached</th>
                <th className="pb-2 pr-4">Stage recorded at</th>
                <th className="pb-2 pr-4">Attempts</th>
                <th className="pb-2">Failure reason (admin only)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ivory-border/70 last:border-0">
                  <td className="py-2 pr-4 text-body">{row.residentName ?? "Unknown client"}</td>
                  <td className="py-2 pr-4 font-mono text-muted" title={row.id}>
                    {shortSessionId(row.id)}
                  </td>
                  <td className="py-2 pr-4 text-muted">{formatTimestamp(row.startedAt)}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-body">{describeStage(row)}</td>
                  <td className="py-2 pr-4 text-muted">{formatTimestamp(row.processingDiagnosticStageAt)}</td>
                  <td className="py-2 pr-4 text-muted">{row.processingAttemptCount}</td>
                  <td className="py-2 text-muted">{row.failureReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
