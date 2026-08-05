import type { OperationalBrief } from "@/lib/recruiting/operationalUnderstanding/generateOperationalBrief";

// The concise, product-facing brief — Phase 4 of the approved "Assisted
// Cross-System Flight" plan. This is what a normal office user reads first;
// the full desired-state/gap/evidence breakdown lives below as drill-down
// material (see OperationalUnderstandingCard).
export function OperationalBriefCard({ brief }: { brief: OperationalBrief }) {
  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-serif text-card-title font-light text-body">Operational Brief</h2>
      </div>

      <div className="space-y-4">
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Current Understanding</p>
          <p className="mt-1 font-sans text-base text-body">{brief.currentUnderstanding}</p>
        </div>

        {brief.currentCapability && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Current Capability</p>
            <p className="mt-1 font-sans text-sm text-body">{brief.currentCapability}</p>
          </div>
        )}

        <div className="rounded-lg border border-gold/30 bg-gold-subtle/40 p-4">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-gold-dark">Next Action</p>
          <p className="mt-1 font-sans text-base text-body">
            {brief.nextAction ?? "No action is currently recommended."}
          </p>
        </div>

        {brief.whyThisMatters.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Why This Matters</p>
            <ul className="mt-1 space-y-0.5 font-sans text-sm text-body">
              {brief.whyThisMatters.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          </div>
        )}

        {brief.uncertainty.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Uncertainty</p>
            <ul className="mt-1 space-y-0.5 font-sans text-sm text-muted">
              {brief.uncertainty.map((u, i) => (
                <li key={i}>• {u}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
