import Link from "next/link";
import type { WorkforceRosterEntry } from "@/lib/workforce/roster";

// The Dashboard's own answer to "is every employee currently eligible to
// work" — six cards, each linking to the filtered roster view behind it.
// Every count excludes terminated caregivers from the denominator, same
// discipline as the existing Registry Evidence summary (RegistryEvidenceSummary.tsx).
export function EmployeeRecordAuditSummary({ roster }: { roster: WorkforceRosterEntry[] }) {
  const eligible = roster.filter((r) => r.employeeRecordAudit.readiness !== "not_applicable");
  const ready = eligible.filter((r) => r.employeeRecordAudit.readiness === "ready").length;
  const blocked = eligible.filter((r) => r.employeeRecordAudit.readiness === "blocked").length;
  const expiringSoon = eligible.filter((r) => r.employeeRecordAudit.readiness === "expiring_soon").length;
  const allOpenActions = roster.flatMap((r) => r.openActions);
  const criticalIssues = allOpenActions.filter((a) => a.priority === "urgent").length;
  const openActions = allOpenActions.length;
  const auditorReadinessPct = eligible.length > 0 ? Math.round((ready / eligible.length) * 100) : 0;

  const tiles: Array<{ label: string; value: string | number; href: string; emphasis?: "good" | "bad" }> = [
    { label: "Employees Ready", value: ready, href: "/workforce?filter=era_ready", emphasis: "good" },
    { label: "Employees Blocked", value: blocked, href: "/workforce?filter=era_blocked", emphasis: blocked > 0 ? "bad" : undefined },
    { label: "Expiring Soon", value: expiringSoon, href: "/workforce?filter=era_expiring_soon" },
    { label: "Critical Issues", value: criticalIssues, href: "/workforce?filter=era_open_actions", emphasis: criticalIssues > 0 ? "bad" : undefined },
    { label: "Open Actions", value: openActions, href: "/workforce?filter=era_open_actions" },
    { label: "Auditor Readiness", value: `${auditorReadinessPct}%`, href: "/workforce?filter=era_blocked", emphasis: auditorReadinessPct === 100 ? "good" : undefined },
  ];

  return (
    <div>
      <h3 className="mb-3 font-sans text-label font-semibold uppercase tracking-widest text-muted">Employee Record Audit</h3>
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
