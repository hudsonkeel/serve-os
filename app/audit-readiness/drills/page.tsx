import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canRunAuditDrill } from "@/lib/compliance/permissions";
import { listAuditSessions } from "@/lib/data/auditSessions";
import { getAuditSessionFollowUpSummary, type AuditSessionFollowUpSummary } from "@/lib/compliance/auditDrillView";
import { formatCentralDateTime } from "@/lib/utils/date";
import type { AuditSessionStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_LABELS: Record<AuditSessionStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
};

const STATUS_TONES: Record<AuditSessionStatus, BadgeTone> = {
  draft: "neutral",
  in_progress: "blue",
  completed: "success",
};

function followUpLine(summary: AuditSessionFollowUpSummary): string {
  if (summary.totalCount === 0) return "no follow-up needed";
  if (summary.openCount === 0) return `${summary.resolvedCount} resolved`;
  return `${summary.openCount} open, ${summary.resolvedCount} resolved`;
}

export default async function AuditDrillsPage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canRunAuditDrill(profile?.role ?? null)) {
    return (
      <PageContainer title="Audit Drills">
        <p className="font-sans text-sm text-muted">You do not have permission to view Audit Drills.</p>
      </PageContainer>
    );
  }

  const sessions = await listAuditSessions();
  // Follow-up summaries are O(items) each — only computed for completed
  // sessions, where the count actually means something (an in-progress
  // audit's follow-up count isn't final yet).
  const followUpBySessionId = new Map<string, AuditSessionFollowUpSummary>(
    await Promise.all(
      sessions
        .filter((s) => s.status === "completed")
        .map(async (s) => [s.id, await getAuditSessionFollowUpSummary(s.id)] as const)
    )
  );

  return (
    <PageContainer title="Audit Drills">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light text-body">Audit Drills</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            Start an audit, walk requirements against real subjects, and record findings — a completed drill is
            locked and reviewable exactly as it was recorded.
          </p>
        </div>
        <Link
          href="/audit-readiness/drills/new"
          className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light"
        >
          Start New Audit
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-ivory-border bg-surface px-8 py-16 text-center shadow-card">
          <p className="font-serif text-xl text-muted">No audit drills yet</p>
          <p className="mt-2 font-sans text-sm text-muted">Start one to begin walking requirements against real subjects.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ivory-border bg-white">
          <table className="w-full text-left font-sans text-sm">
            <thead className="border-b border-ivory-border bg-ivory-warm">
              <tr>
                <th className="px-4 py-3 font-medium text-muted">Name</th>
                <th className="px-4 py-3 font-medium text-muted">Auditor</th>
                <th className="px-4 py-3 font-medium text-muted">Status</th>
                <th className="px-4 py-3 font-medium text-muted">Started</th>
                <th className="px-4 py-3 font-medium text-muted">Completed</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b border-ivory-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-body">{session.name}</td>
                  <td className="px-4 py-3 text-muted">{session.auditor}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[session.status]}>{STATUS_LABELS[session.status]}</Badge>
                    {session.status === "completed" && (
                      <span className="ml-2 font-sans text-xs text-muted">
                        {followUpLine(followUpBySessionId.get(session.id)!)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatCentralDateTime(session.started_at)}</td>
                  <td className="px-4 py-3 text-muted">
                    {session.completed_at ? formatCentralDateTime(session.completed_at) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/audit-readiness/drills/${session.id}`}
                      className="font-sans text-sm font-medium text-navy hover:text-navy-light"
                    >
                      {session.status === "completed" ? "View →" : "Continue →"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
