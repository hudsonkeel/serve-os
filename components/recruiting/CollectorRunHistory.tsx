import type { RecruitingLeadCollectorRun } from "@/lib/supabase/types";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Append-only run history — every attempt, including failed ones, stays
// visible so a stale/unavailable source is never mistaken for silence.
export function CollectorRunHistory({ runs }: { runs: RecruitingLeadCollectorRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
        <h2 className="mb-1 font-serif text-card-title font-light text-body">Collector Run History</h2>
        <p className="font-sans text-sm text-muted">No collector runs have been recorded for this lead.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <h2 className="mb-3 font-serif text-card-title font-light text-body">Collector Run History</h2>
      <div className="space-y-2">
        {runs.map((run) => (
          <div key={run.id} className="flex items-center justify-between gap-2 border-b border-ivory-border pb-1.5 text-sm">
            <span className="font-sans text-body">
              {run.source_system} — {run.status}
              {run.match_status ? ` (${run.match_status})` : ""}
            </span>
            <span className="font-sans text-xs text-muted">
              {formatDate(run.started_at)} · {run.initiated_by}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
