import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { getCommunityRosterImportHistory } from "@/lib/actions/communityRosterImport";
import type { RosterImportRunStatus } from "@/lib/data/residentRoster";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Community Roster Import + Reconciliation phase, Pass 1 — import history
// (section 32). List/detail convention matching /audit-readiness/drills.
// A roster row here answers "who lives in this community," never "who is
// a Serve client" (section 15) — that distinction is made explicit again
// in the review/commit UI, not just here.
const STATUS_LABELS: Record<RosterImportRunStatus, string> = {
  analyzing: "Analyzing",
  pending_review: "Needs Review",
  partially_committed: "Partially Committed",
  committed: "Committed",
  cancelled: "Cancelled",
  failed: "Failed",
  completed: "Completed",
};

const STATUS_TONES: Record<RosterImportRunStatus, BadgeTone> = {
  analyzing: "neutral",
  pending_review: "warning",
  partially_committed: "blue",
  committed: "success",
  cancelled: "neutral",
  failed: "danger",
  completed: "success",
};

export default async function RosterImportHistoryPage() {
  const profile = await getCurrentAuthorizedUser();
  const canAct = canPerformReconciliationActions(profile?.role);
  const runs = await getCommunityRosterImportHistory();

  return (
    <PageContainer title="The People We Serve · Community Roster Imports">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Community Roster Imports</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Import a community&rsquo;s resident roster and reconcile it against Serve&rsquo;s existing people. Roster
            membership identifies who lives in a community — it never creates a Serve client or prospect relationship
            on its own.
          </p>
        </div>
        {canAct && (
          <Link
            href="/residents/roster-import/new"
            className="rounded-lg bg-navy px-4 py-2 font-sans text-button font-medium text-white shadow-card hover:bg-navy-light"
          >
            Import a Roster
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
        {runs.length > 0 ? (
          <div className="divide-y divide-ivory-border">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/residents/roster-import/${run.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-ivory"
              >
                <div className="min-w-0">
                  <p className="font-sans text-card-title font-semibold text-body">{run.sourceFilename}</p>
                  <p className="mt-0.5 font-sans text-sm text-muted">
                    {run.communityCode} · {new Date(run.importedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                    {run.importedBy}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {run.totalSourceRows !== null && (
                    <span className="font-sans text-sm text-muted">{run.totalSourceRows} rows</span>
                  )}
                  {!!run.unresolvedCount && (
                    <span className="font-sans text-sm font-medium text-warning-text">{run.unresolvedCount} unresolved</span>
                  )}
                  <Badge tone={STATUS_TONES[run.status]}>{STATUS_LABELS[run.status]}</Badge>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-5 py-14">
            <EmptyState title="No roster imports yet" description="Import a community's resident roster to get started." />
          </div>
        )}
      </div>
    </PageContainer>
  );
}
