import { SECONDARY_BUTTON_SMALL_CLASS } from "@/components/ui/actionButtonStyles";

// Native <details>/<summary> — same zero-JS, no-hydration-required
// mechanic as CollapsibleSection.tsx (Record & History), but with its own
// richer summary line (a computed readiness metric, not just a static
// title+description) so it can show the Audit Readiness interaction
// grammar directly in the collapsed state: name / current status / short
// explanation / action.
//
// The resident profile is primarily a CRM/relationship workspace — Client
// Readiness is an important governed capability within it, not the thing
// that should dominate every profile by default. Collapsed by default in
// every case; what differs is only what the summary line says.
export function ClientReadinessSection({
  isOutsidePopulation,
  applicableCount,
  satisfiedCount,
  defaultOpen = false,
  children,
}: {
  // Whether this resident currently falls outside the Client Readiness
  // population (no active Serve relationship) — computed by the caller
  // from the same canonical relationship projection Audit Readiness's own
  // active-client gate uses, never a second, independently-maintained
  // check.
  isOutsidePopulation: boolean;
  applicableCount: number;
  satisfiedCount: number;
  // True when a specific requirement was deep-linked to (?requirement=) —
  // the section must open regardless of the default, or the link lands
  // on a collapsed panel hiding the very card it pointed at.
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const needsAttentionCount = Math.max(applicableCount - satisfiedCount, 0);
  const readinessPct = applicableCount > 0 ? Math.round((satisfiedCount / applicableCount) * 100) : 0;

  let heading: string;
  let summary: string;
  let actionLabel: string;

  if (isOutsidePopulation) {
    heading = "Client Readiness";
    summary = "Not currently applicable — no active Serve relationship.";
    actionLabel = "Open Client Readiness";
  } else if (needsAttentionCount === 0) {
    heading = `Client Readiness — ${readinessPct}%`;
    summary = applicableCount > 0 ? "All applicable requirements satisfied." : "No applicable requirements yet.";
    actionLabel = "Open Client Readiness";
  } else {
    heading = `Client Readiness — ${readinessPct}%`;
    summary = `${needsAttentionCount} item${needsAttentionCount === 1 ? "" : "s"} need${needsAttentionCount === 1 ? "s" : ""} attention.`;
    actionLabel = "Review Readiness";
  }

  return (
    <details className="group rounded-xl border border-ivory-border bg-surface shadow-card" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 select-none">
        <div className="min-w-0">
          <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">{heading}</p>
          <p className="mt-0.5 font-sans text-sm text-body">{summary}</p>
        </div>
        {/* A span, not a nested <button> — <summary> is already the real
            (native, keyboard-accessible) toggle target for this whole row;
            a <button> here would be an invalid nested-interactive element.
            Styled to read as an obvious secondary button regardless. */}
        <span className={SECONDARY_BUTTON_SMALL_CLASS + " shrink-0"}>
          {actionLabel} <span className="inline-block transition-transform group-open:rotate-90">→</span>
        </span>
      </summary>
      <div className="border-t border-ivory-border p-5">{children}</div>
    </details>
  );
}
