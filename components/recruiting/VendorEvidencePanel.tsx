import type { CollectorSourceSystem, RecruitingLeadCollectorRun, RecruitingLeadObservation } from "@/lib/supabase/types";
import { shortenVendorId } from "@/lib/recruiting/extractors/apploi/vendorIdentity";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const VENDOR_LABEL: Record<CollectorSourceSystem, string> = { apploi: "Apploi", viventium: "Viventium" };

const MATCH_LABEL: Record<string, string> = {
  found: "Match found",
  not_found: "No matching record found",
  ambiguous_multiple_matches: "Multiple possible matches",
  search_incomplete: "Search did not complete",
};

// Raw vendor observations, source-attributed — deliberately distinct from
// HiringSynthesisCard's derived conclusions. This panel shows only what was
// directly reported during a collector run; it never interprets it.
export function VendorEvidencePanel({
  source,
  latestRun,
  observations,
}: {
  source: CollectorSourceSystem;
  latestRun: RecruitingLeadCollectorRun | null;
  observations: RecruitingLeadObservation[];
}) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-serif text-card-title font-light text-body">{VENDOR_LABEL[source]} Evidence</h2>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-widest text-blue-700">
          Vendor observation
        </span>
      </div>

      {!latestRun ? (
        <p className="mt-2 font-sans text-sm text-muted">No {VENDOR_LABEL[source]} search has been run for this lead yet.</p>
      ) : (
        <>
          <p className="mt-1 font-sans text-xs text-subtle">
            Last run {formatDate(latestRun.completed_at ?? latestRun.started_at)} by {latestRun.initiated_by} —{" "}
            {MATCH_LABEL[latestRun.match_status ?? ""] ?? latestRun.status}
          </p>

          {observations.length > 0 ? (
            <div className="mt-3 space-y-3">
              {observations.map((o) => (
                <div key={o.id} className="border-b border-ivory-border pb-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-sans text-muted">{o.observation_key}</span>
                    <span className="font-sans text-body">
                      {o.visibility === "directly_observed" ? (o.normalized_value ?? "—") : o.visibility.replace(/_/g, " ")}
                    </span>
                  </div>
                  {o.raw_label && o.raw_label !== o.normalized_value && (
                    <p className="mt-0.5 font-sans text-xs text-subtle">Raw: “{o.raw_label}”</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-sans text-[11px] text-muted">
                    {o.collection_method && <span>{o.collection_method === "automatic_dom" ? "Automatic (DOM)" : "Guided manual"}</span>}
                    {o.extraction_confidence && <span>Confidence: {o.extraction_confidence}</span>}
                    {o.match_method && <span>Match: {o.match_method.replace(/_/g, " ")}</span>}
                    {o.source_record_id && <span>Record: {shortenVendorId(o.source_record_id)}</span>}
                    <span>Observed {formatDate(o.observed_at)}</span>
                    <span>Collected {formatDate(o.collected_at)}</span>
                    {o.failure_reason && <span>Reason: {o.failure_reason}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 font-sans text-sm text-muted">No fields were recorded on the last run.</p>
          )}
        </>
      )}
    </div>
  );
}
