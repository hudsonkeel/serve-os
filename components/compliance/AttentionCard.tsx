import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { AUDIT_READINESS_STATUS_LABELS, AUDIT_READINESS_STATUS_TONES } from "@/lib/compliance/auditReadinessDashboard";
import type { AuditReadinessStatus } from "@/lib/compliance/auditReadinessStatus";

// Shared compact footprint every card in this file uses — actionable,
// all-clear, and coming-soon states all read as the same visual family in
// a wrapping row, never a tall mostly-empty placeholder.
export const CARD_BASE = "flex w-56 shrink-0 flex-col gap-1.5 rounded-xl border px-4 py-3 shadow-card";

// The shared compact actionable-card grammar for "who needs attention" —
// name, a visually prominent status, an optional item count, one CTA. Built
// for the Audit Readiness dashboard's Needs Attention grid, deliberately
// generic (no Workforce-specific field) so Client Readiness/Emergency
// Preparedness reuse this exact component once they're seeded, rather than
// each inventing their own card. Flows in a wrapping row via its own fixed
// width — the caller just needs a flex-wrap container.
export function AttentionCard({
  name,
  itemCount,
  href,
}: {
  name: string;
  itemCount: number;
  href: string;
}) {
  return (
    <Link href={href} className={`${CARD_BASE} border-ivory-border bg-white hover:border-navy/30`}>
      {/* No truncate — a name that doesn't fit on one line wraps to a
          second instead of losing text to an ellipsis (Emergency
          Preparedness's requirement titles are longer than Workforce's
          employee names; the card simply grows taller for them, width
          unchanged). */}
      <span className="font-sans text-sm font-semibold text-body">{name}</span>
      <Badge tone="danger">Needs Attention</Badge>
      <span className="font-sans text-xs text-muted">
        {itemCount} item{itemCount === 1 ? "" : "s"}
      </span>
      <span className="font-sans text-xs font-medium text-navy">Review &amp; Resolve →</span>
    </Link>
  );
}

// State 2 of the three-state rule: configured and genuinely nothing to do
// right now — said explicitly, not left as blank space that could be
// mistaken for "not configured."
export function AllClearAttentionCard({ message }: { message: string }) {
  return (
    <div className={`${CARD_BASE} border-ivory-border bg-success-surface`}>
      <span className="font-sans text-sm font-semibold text-success-text">✓ No current actions</span>
      <span className="font-sans text-xs text-success-text">{message}</span>
    </div>
  );
}

// State 3 of the three-state rule: no seeded requirement data for this
// domain yet — never shown alongside a positive "ready" claim, since
// nothing has actually been evaluated.
export function ComingSoonAttentionCard() {
  return (
    <div className={`${CARD_BASE} border-ivory-border bg-ivory-warm`}>
      <span className="font-sans text-sm font-semibold text-subtle">Coming Soon</span>
      <span className="font-sans text-xs text-muted">Readiness requirements not yet configured.</span>
    </div>
  );
}

// A fourth, distinct state from ComingSoonAttentionCard above: the domain
// IS configured (real requirement data exists), but there are currently
// zero eligible subjects to evaluate — e.g. Client Readiness before any
// resident has become an Active Client. Never "Coming Soon" (that would
// misreport a real, working configuration as unbuilt) and never
// AllClearAttentionCard's success-green "no current actions" (there is
// nothing to be clear about yet — no false positive claim of readiness).
export function AwaitingFirstSubjectAttentionCard({ message }: { message: string }) {
  return (
    <div className={`${CARD_BASE} border-ivory-border bg-ivory-warm`}>
      <span className="font-sans text-sm font-semibold text-subtle">No Active Clients Yet</span>
      <span className="font-sans text-xs text-muted">{message}</span>
    </div>
  );
}

// The shared "summary card -> selecting it reveals the detail" grammar,
// generalized beyond Needs Attention: a compact card for a single
// requirement's CURRENT status (any AuditReadinessStatus, not just
// "needs attention"), one plain-language explanation, and one primary CTA
// — matching AttentionCard's own dimensions/border/typography/spacing
// exactly (same CARD_BASE) so a page mixing this with AttentionCard never
// reads as a different visual family. A button, not a Link — selecting it
// is meant to reveal an in-page detail/remediation panel (see
// components/emergencyPreparedness/RequirementBoard.tsx for the first real
// consumer), never a navigation. Every Audit Readiness domain whose
// underlying concept is "one requirement, one current status" should reuse
// this rather than inventing a parallel card.
export function RequirementStatusCard({
  name,
  status,
  explanation,
  ctaLabel,
  isSelected = false,
  onClick,
}: {
  name: string;
  status: AuditReadinessStatus;
  explanation: string;
  ctaLabel: string;
  isSelected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`${CARD_BASE} text-left ${isSelected ? "border-navy bg-ivory-warm" : "border-ivory-border bg-white hover:border-navy/30"}`}
    >
      <span className="font-sans text-sm font-semibold text-body">{name}</span>
      <Badge tone={AUDIT_READINESS_STATUS_TONES[status]}>{AUDIT_READINESS_STATUS_LABELS[status]}</Badge>
      <span className="font-sans text-xs text-muted">{explanation}</span>
      <span className="font-sans text-xs font-medium text-navy">{ctaLabel}</span>
    </button>
  );
}

// The one CTA-label rule every RequirementStatusCard consumer should share
// — "View Evidence" for anything already satisfied (compliant/
// satisfied_by_event/exception all read as "satisfied," per
// auditReadinessStatus.ts), "View Requirement" for not_applicable (nothing
// to resolve, just context), "Review & Resolve" for every open problem.
export function resolveStatusCardCta(status: AuditReadinessStatus): string {
  if (status === "not_applicable") return "View Requirement →";
  if (status === "compliant" || status === "satisfied_by_event" || status === "exception") return "View Evidence →";
  return "Review & Resolve →";
}
