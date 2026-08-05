import type { DesiredStateEvaluationResult, DesiredStateStatus, OperationalGap } from "@/lib/recruiting/operationalUnderstanding/types";
import type { CapabilityEvaluationResult } from "@/lib/recruiting/operationalUnderstanding/capabilities";

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_LABEL: Record<DesiredStateStatus, string> = {
  satisfied: "Satisfied",
  blocked: "Blocked",
  unknown: "Unknown",
  in_progress: "In Progress",
  not_applicable: "Not Applicable",
};

const STATUS_CLASS: Record<DesiredStateStatus, string> = {
  satisfied: "bg-emerald-100 text-emerald-700",
  blocked: "bg-red-100 text-red-600",
  unknown: "bg-gray-100 text-gray-500",
  in_progress: "bg-blue-100 text-blue-700",
  not_applicable: "bg-gray-50 text-gray-400",
};

export interface WhyReference {
  readonly label: string;
  readonly observedAt: string | null;
  readonly sourceSystem: string;
}

function GapList({ gaps, tone }: { gaps: OperationalGap[]; tone: "red" | "blue" | "amber" }) {
  const toneClass = { red: "border-red-200 bg-red-50 text-red-800", blue: "border-blue-200 bg-blue-50 text-blue-800", amber: "border-amber-200 bg-amber-50 text-amber-800" }[tone];
  return (
    <ul className={`mt-1 space-y-1 rounded-lg border p-3 font-sans text-sm ${toneClass}`}>
      {gaps.map((g, i) => (
        <li key={i}>• {g.description}</li>
      ))}
    </ul>
  );
}

// Deterministic Desired State evaluations, recomputed fresh on every page
// load from persisted observations/inferences/human confirmations/vendor
// identities — never read from a stale snapshot. See
// docs/intelligence/RECRUITING_OPERATIONAL_UNDERSTANDING_ENGINE.md.
export function OperationalUnderstandingCard({
  narrative,
  results,
  capabilities,
  nextRecommendedAction,
  why,
  sourceFreshness,
}: {
  narrative: string;
  results: readonly DesiredStateEvaluationResult[];
  capabilities?: readonly CapabilityEvaluationResult[];
  nextRecommendedAction: string | null;
  why: readonly WhyReference[];
  sourceFreshness: string | null;
}) {
  const blockingGaps = results.flatMap((r) => r.gaps.filter((g) => g.kind === "blocking"));
  const conflictingGaps = results.flatMap((r) => r.gaps.filter((g) => g.kind === "conflicting"));
  const integrationGaps = results.flatMap((r) => r.gaps.filter((g) => g.kind === "integration"));
  const policyGaps = results.flatMap((r) => r.gaps.filter((g) => g.kind === "policy_dependent_consideration"));
  const humanDecisionGaps = results.flatMap((r) => r.gaps.filter((g) => g.kind === "human_decision_required"));
  const unknownResults = results.filter((r) => r.status === "unknown" || r.status === "in_progress");
  const evidenceNeeded = [...new Set(results.flatMap((r) => [...r.unknownEvidence, ...r.gaps.flatMap((g) => g.missingEvidence)]))];

  return (
    <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-serif text-card-title font-light text-body">Operational Understanding</h2>
        <span className="rounded-full bg-gold-subtle/60 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-widest text-gold-dark">
          Derived — Deterministic
        </span>
      </div>
      <p className="mb-1 font-sans text-xs text-subtle">
        Computed fresh from persisted evidence every time this page loads — never AI, never probabilistic, never a stale snapshot.
      </p>
      <p className="mb-4 font-sans text-xs text-subtle">
        {sourceFreshness ? `Source freshness: ${formatDate(sourceFreshness)}` : "No source evidence has been collected yet."}
      </p>

      <div className="space-y-4">
        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Current Operational Understanding</p>
          <p className="mt-1 font-sans text-sm text-body">{narrative}</p>
        </div>

        <div>
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Desired-State Progress</p>
          <div className="mt-2 space-y-1.5">
            {results.map((r) => (
              <div key={r.desiredStateKey} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-sans text-body">{r.desiredStateKey.replace("recruiting.desired_state.", "").replace(/_/g, " ")}</span>
                <span className={`rounded-full px-2 py-0.5 font-sans text-[11px] font-medium ${STATUS_CLASS[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {capabilities && capabilities.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Current Capabilities</p>
            <div className="mt-2 space-y-1.5">
              {capabilities.map((c) => (
                <div key={c.capabilityKey} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-sans text-body">{c.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-sans text-[11px] font-medium ${
                      c.status === "granted"
                        ? "bg-emerald-100 text-emerald-700"
                        : c.status === "not_granted"
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {c.status === "granted" ? "Granted" : c.status === "not_granted" ? "Not granted" : "Unknown"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1 font-sans text-xs text-subtle">
              A capability is only ever granted by the specific Desired State that governs it — never inferred from an earlier, unrelated stage&apos;s success.
            </p>
          </div>
        )}

        {blockingGaps.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-red-700">Confirmed Gaps</p>
            <GapList gaps={blockingGaps} tone="red" />
          </div>
        )}

        {conflictingGaps.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-red-700">Conflicting Evidence</p>
            <p className="mt-0.5 font-sans text-xs text-subtle">
              Two authoritative sources disagree — this blocks progress until a human reviews and resolves it.
            </p>
            <GapList gaps={conflictingGaps} tone="red" />
          </div>
        )}

        {humanDecisionGaps.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-blue-700">Human Decision Required</p>
            <p className="mt-0.5 font-sans text-xs text-subtle">
              Evidence alone cannot resolve this — an authorized person must decide.
            </p>
            <GapList gaps={humanDecisionGaps} tone="blue" />
          </div>
        )}

        {integrationGaps.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-blue-700">Integration Gaps</p>
            <p className="mt-0.5 font-sans text-xs text-subtle">
              A limitation in what one source can see — never confirmed evidence about the underlying condition.
            </p>
            <GapList gaps={integrationGaps} tone="blue" />
          </div>
        )}

        {policyGaps.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-amber-700">Policy-Dependent Considerations</p>
            <p className="mt-0.5 font-sans text-xs text-subtle">
              These would only matter if Serve adopts the underlying requirement — none currently blocks progression.
            </p>
            <GapList gaps={policyGaps} tone="amber" />
          </div>
        )}

        {unknownResults.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Unknowns</p>
            <ul className="mt-1 space-y-0.5 font-sans text-sm text-muted">
              {unknownResults.map((r) => (
                <li key={r.desiredStateKey}>
                  • {r.explanation}
                  {r.status === "in_progress" ? " (in progress)" : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1 font-sans text-xs text-subtle">
              An unresolved requirement is never displayed as if the candidate failed it — it means the evidence to decide either way does not exist yet.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-gold/30 bg-gold-subtle/40 p-4">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-gold-dark">Next Recommended Action</p>
          <p className="mt-1 font-sans text-sm text-body">
            {nextRecommendedAction ?? "No action is currently recommended — every reachable desired state is either satisfied or not yet applicable."}
          </p>
        </div>

        {evidenceNeeded.length > 0 && (
          <div>
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Evidence Needed</p>
            <ul className="mt-1 space-y-0.5 font-sans text-sm text-muted">
              {evidenceNeeded.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          </div>
        )}

        {why.length > 0 && (
          <div className="border-t border-ivory-border pt-3">
            <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Why — source observations</p>
            <ul className="mt-1 space-y-0.5 font-sans text-xs text-muted">
              {why.map((ref, i) => (
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
