import type { InferenceInput } from "@/lib/recruiting/deriveHiringSynthesis";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STRENGTH_CLASS: Record<string, string> = {
  strong: "bg-purple-100 text-purple-700",
  moderate: "bg-purple-50 text-purple-600",
  weak: "bg-gray-100 text-gray-500",
};

// Deterministically Inferred — visually and semantically distinct from
// both direct observations (VendorEvidencePanel) and human-confirmed facts
// (HumanConfirmationsPanel). Never rendered with the same badge/color as
// either. Every entry always shows its unresolved alternatives and what
// evidence would resolve them — an inference is never presented as if it
// were a settled fact.
export function InferredSignalsPanel({ inferences }: { inferences: InferenceInput[] }) {
  if (inferences.length === 0) {
    return (
      <div>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
            Deterministic Inferences
          </h3>
          <span className="rounded-full bg-purple-100 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-widest text-purple-700">
            Inferred
          </span>
        </div>
        <p className="font-sans text-sm text-muted">No inferences have been produced yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
          Deterministic Inferences
        </h3>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-widest text-purple-700">
          Inferred
        </span>
      </div>
      <div className="space-y-3">
        {inferences.map((inference, i) => (
          <div key={i} className="rounded-lg border border-purple-100 bg-purple-50/40 px-4 py-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-sans text-sm font-medium text-body">{inference.signalKey.replace("recruiting.", "")}</span>
              <span className={`rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-widest ${STRENGTH_CLASS[inference.strength]}`}>
                {inference.strength}
              </span>
            </div>
            <p className="font-sans text-sm text-body">{inference.explanation}</p>
            {inference.unresolvedAlternatives.length > 0 && (
              <div className="mt-2">
                <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Unresolved alternatives</p>
                <ul className="mt-0.5 space-y-0.5 font-sans text-xs text-muted">
                  {inference.unresolvedAlternatives.map((a, j) => (
                    <li key={j}>• {a}</li>
                  ))}
                </ul>
              </div>
            )}
            {inference.evidenceNeededToResolve.length > 0 && (
              <div className="mt-2">
                <p className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Evidence needed to resolve</p>
                <ul className="mt-0.5 space-y-0.5 font-sans text-xs text-muted">
                  {inference.evidenceNeededToResolve.map((e, j) => (
                    <li key={j}>• {e}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 font-sans text-[11px] text-subtle">Computed {formatDate(inference.computedAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
