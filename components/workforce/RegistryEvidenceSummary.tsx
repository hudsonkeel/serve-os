import Link from "next/link";
import type { WorkforceRosterEntry } from "@/lib/workforce/roster";
import { summarizeWorkforceRegistry } from "@/lib/workforce/registrySummary";

// QAPI Registry Evidence summary — counts only, every count links to the
// underlying filtered caregiver list (via /workforce?filter=...), per the
// mission's explicit requirement. Not a full QAPI module — a simple
// counts-and-links summary, avoiding charts where they wouldn't improve
// comprehension.
//
// Compliance tiles (NAR/EMR complete, both complete, awaiting verification)
// exclude terminated caregivers from their counts entirely — see
// lib/workforce/registrySummary.ts's summarizeWorkforceRegistry(). The
// lifecycle tiles (Active/Inactive/Terminated/Pending Start) are the only
// place terminated caregivers are counted, since they remain searchable
// and available for historical audit, just not part of "current"
// compliance totals.
export function RegistryEvidenceSummary({
  roster,
  identityReviewCount,
}: {
  roster: WorkforceRosterEntry[];
  identityReviewCount: number;
}) {
  const summary = summarizeWorkforceRegistry(roster.map((r) => ({ lifecycleStatus: r.lifecycle.status, registry: r.registry })));

  const lifecycleTiles: Array<{ label: string; count: number; href: string }> = [
    { label: "Active", count: summary.active, href: "/workforce?filter=active" },
    { label: "Inactive", count: summary.inactive, href: "/workforce?filter=inactive" },
    { label: "Terminated", count: summary.terminated, href: "/workforce?filter=terminated" },
    ...(summary.pendingStart > 0
      ? [{ label: "Pending Start", count: summary.pendingStart, href: "/workforce?filter=pending_start" }]
      : []),
  ];

  const complianceTiles: Array<{ label: string; count: number; href: string }> = [
    { label: "NAR complete", count: summary.narComplete, href: "/workforce?filter=nar_complete" },
    { label: "EMR complete", count: summary.emrComplete, href: "/workforce?filter=emr_complete" },
    { label: "Both complete", count: summary.bothComplete, href: "/workforce?filter=complete" },
    { label: "Awaiting verification", count: summary.awaitingVerification, href: "/workforce?filter=awaiting_verification" },
    { label: "Missing evidence", count: summary.missingEvidence, href: "/workforce?filter=all" },
    { label: "Identity review required", count: identityReviewCount, href: "/workforce/identity-review" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {lifecycleTiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-xl border border-ivory-border bg-surface px-4 py-3 text-center shadow-card hover:border-navy/20"
          >
            <p className="font-serif text-2xl font-light text-body">{tile.count}</p>
            <p className="mt-1 font-sans text-[11px] font-medium uppercase tracking-wide text-muted">{tile.label}</p>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {complianceTiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-xl border border-ivory-border bg-surface px-4 py-3 text-center shadow-card hover:border-navy/20"
          >
            <p className="font-serif text-2xl font-light text-body">{tile.count}</p>
            <p className="mt-1 font-sans text-[11px] font-medium uppercase tracking-wide text-muted">{tile.label}</p>
          </Link>
        ))}
      </div>
      {summary.terminated > 0 && (
        <p className="font-sans text-[11px] text-subtle">
          Compliance totals above exclude {summary.terminated} terminated {summary.terminated === 1 ? "caregiver" : "caregivers"} —
          view them under the Terminated filter.
        </p>
      )}
    </div>
  );
}
