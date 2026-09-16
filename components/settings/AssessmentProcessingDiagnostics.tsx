import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { ProcessingDiagnosticRow } from "@/lib/data/assessmentIntelligence";

// Admin/diagnostic-only table — not part of the normal assessor workflow (see
// AssessmentProcessingDispatchTrigger's header comment for why this section exists at all).
// Shows the furthest stage each in-flight session's most recent dispatch/claim attempt reached,
// so the next test can tell exactly where processing stopped without Netlify log access.

const STATUS_TONE: Record<string, BadgeTone> = {
  queued: "neutral",
  processing: "blue",
  failed: "danger",
};

const STAGE_LABELS: Record<string, string> = {
  dispatched: "Dispatcher submitted",
  invocation_accepted: "Netlify accepted invocation",
  worker_received: "Worker started (authenticated)",
  extraction_started: "Extraction started",
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
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
    return STAGE_LABELS[row.processingDiagnosticStage] ?? row.processingDiagnosticStage;
  }
  return row.status === "queued" ? "Not yet submitted" : "—";
}

export function AssessmentProcessingDiagnostics({ rows }: { rows: ProcessingDiagnosticRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-sans text-sm text-muted">
        No sessions are currently queued, processing, or failed.
      </p>
    );
  }

  return (
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
  );
}
