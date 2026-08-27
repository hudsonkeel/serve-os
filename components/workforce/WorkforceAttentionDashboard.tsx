import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import type { WorkforceRosterEntry } from "@/lib/workforce/roster";

// The Dashboard's answer to exactly one question: "what deserves attention
// today?" Per the Attention-Driven Operations mission, this replaces
// EmployeeRecordAuditSummary/RegistryEvidenceSummary on the dashboard —
// those files stay in place (unused here) rather than being deleted, since
// their tiles remain valid Level-1 concepts, just not what should greet
// Elizabeth first every morning. No compliance table, no NAR/EMR/category
// breakdown here — six cards, each linking straight to the filtered roster
// view behind it.
//
// Workforce Lifecycle Boundary: every one of the six tiles below is
// already scoped to the active workforce by construction —
// attentionState.state can only be action_needed/due_soon/review/waiting/
// ready for an active member (see lib/workforce/attentionState.ts), and
// openActions is empty for terminated/inactive members by the time
// syncWorkforceComplianceActionsForMember() has run. No extra filtering is
// needed here to keep those six numbers active-workforce-only. The
// lifecycle row below makes that scope explicit rather than implicit, and
// is the one place terminated/inactive/pending-start counts surface on the
// dashboard at all.
export function WorkforceAttentionDashboard({ roster }: { roster: WorkforceRosterEntry[] }) {
  const actionNeeded = roster.filter((r) => r.attentionState.state === "action_needed").length;
  const dueSoon = roster.filter((r) => r.attentionState.state === "due_soon").length;
  const review = roster.filter((r) => r.attentionState.state === "review").length;
  const waiting = roster.filter((r) => r.attentionState.state === "waiting").length;
  const ready = roster.filter((r) => r.attentionState.state === "ready").length;
  const openActions = roster.reduce((sum, r) => sum + r.openActions.length, 0);

  const active = roster.filter((r) => r.lifecycle.status === "active").length;
  const pendingStart = roster.filter((r) => r.lifecycle.status === "pending_start").length;
  const inactive = roster.filter((r) => r.lifecycle.status === "inactive").length;
  const terminated = roster.filter((r) => r.lifecycle.status === "terminated").length;

  const tiles: Array<{ label: string; value: number; href: string; emphasis?: "good" | "bad" }> = [
    { label: "Action Needed", value: actionNeeded, href: "/workforce?filter=attention_action_needed", emphasis: actionNeeded > 0 ? "bad" : undefined },
    { label: "Due This Week", value: dueSoon, href: "/workforce?filter=attention_due_soon" },
    { label: "Needs Review", value: review, href: "/workforce?filter=attention_review", emphasis: review > 0 ? "bad" : undefined },
    { label: "Waiting", value: waiting, href: "/workforce?filter=attention_waiting" },
    { label: "Ready", value: ready, href: "/workforce?filter=attention_ready", emphasis: "good" },
    { label: "Open Operational Actions", value: openActions, href: "/workforce?filter=has_open_actions" },
  ];

  const lifecycleDenominators: Array<{ label: string; value: number; href: string }> = [
    { label: "Active workforce", value: active, href: "/workforce?filter=active" },
    { label: "Pending start", value: pendingStart, href: "/workforce?filter=pending_start" },
    { label: "Inactive", value: inactive, href: "/workforce?filter=inactive" },
    { label: "Terminated", value: terminated, href: "/workforce?filter=terminated" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-sans text-label font-semibold uppercase tracking-widest text-muted">Today — Active Workforce</h3>
        <div className="flex flex-wrap gap-2">
          {lifecycleDenominators.map((d) => (
            <LinkButton key={d.label} href={d.href} size="small">
              {d.label}: {d.value}
            </LinkButton>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-xl border border-ivory-border bg-surface px-4 py-3 text-center shadow-card hover:border-navy/20"
          >
            <p
              className={`font-serif text-2xl font-light ${
                tile.emphasis === "good" ? "text-emerald-700" : tile.emphasis === "bad" ? "text-red-700" : "text-body"
              }`}
            >
              {tile.value}
            </p>
            <p className="mt-1 font-sans text-[11px] font-medium uppercase tracking-wide text-muted">{tile.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
