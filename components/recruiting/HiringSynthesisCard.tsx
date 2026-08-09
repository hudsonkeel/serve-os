import type { HiringSynthesis } from "@/lib/recruiting/deriveHiringSynthesis";
import { InferredSignalsPanel } from "./InferredSignalsPanel";
import { HumanConfirmationsPanel } from "./HumanConfirmationsPanel";

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_LABEL: Record<string, string> = { met: "Met", unmet: "Not met", unknown: "Unknown" };
const STATUS_CLASS: Record<string, string> = {
  met: "bg-emerald-100 text-emerald-700",
  unmet: "bg-red-100 text-red-600",
  unknown: "bg-gray-100 text-gray-500",
};

// Read-only, computed synthesis — never hand-editable, matching the
// precedent set by RelationshipBriefSection. This is derived state, kept
// visibly distinct from both raw vendor evidence (VendorEvidencePanel) and
// the recruiting lead's own Serve OS status (shown separately on this page).
export function HiringSynthesisCard({ synthesis }: { synthesis: HiringSynthesis }) {
  const freshest = synthesis.why
    .map((r) => r.observedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-serif text-card-title font-light text-body">Hiring Synthesis</h2>
        <span className="rounded-full bg-gold-subtle/60 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-widest text-gold-dark">
          Derived
        </span>
      </div>
      <p className="mb-1 font-sans text-xs text-subtle">
        Computed from the evidence below every time this page loads — not a vendor fact, not the recruiting status above.
      </p>
      <p className="mb-4 font-sans text-xs text-subtle">
        {freshest ? `Freshest source evidence: ${formatDate(freshest)}` : "No source evidence has been collected yet."}
      </p>

      <div className="space-y-4">
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Where are we?</p>
          <p className="mt-1 font-sans text-sm text-body">{synthesis.currentState}</p>
        </div>

        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Requirements</p>
          {synthesis.requirements.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {synthesis.requirements.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-sans text-body">{r.label}</span>
                  <span className={`rounded-full px-2 py-0.5 font-sans text-[11px] font-medium ${STATUS_CLASS[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 font-sans text-sm text-muted">No requirements can be evaluated without vendor evidence yet.</p>
          )}
        </div>

        <InferredSignalsPanel inferences={[...synthesis.inferences]} />
        <HumanConfirmationsPanel confirmations={[...synthesis.humanConfirmations]} />

        {synthesis.unknowns.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">What&apos;s still unknown?</p>
            <ul className="mt-1 space-y-0.5 font-sans text-sm text-muted">
              {synthesis.unknowns.map((u, i) => (
                <li key={i}>• {u}</li>
              ))}
            </ul>
          </div>
        )}

        {synthesis.exceptions.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-amber-700">Exceptions</p>
            <ul className="mt-1 space-y-0.5 font-sans text-sm text-amber-800">
              {synthesis.exceptions.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-gold/30 bg-gold-subtle/40 p-4">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-gold-dark">What should we do next?</p>
          <p className="mt-1 font-sans text-sm text-body">{synthesis.recommendation}</p>
        </div>

        {synthesis.why.length > 0 && (
          <div className="border-t border-ivory-border pt-3">
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Why — source observations</p>
            <ul className="mt-1 space-y-0.5 font-sans text-xs text-muted">
              {synthesis.why.map((ref, i) => (
                <li key={i}>
                  [{ref.sourceSystem}] {ref.label}
                  {formatDate(ref.observedAt) ? ` — observed ${formatDate(ref.observedAt)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
