import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { getWorkforceRoster } from "@/lib/workforce/roster";
import { getIdentityReviewQueue } from "@/lib/data/personVendorIdentityLinks";
import { canAccessWorkforceDocuments, canTriggerAxisCareSync } from "@/lib/workforce/permissions";
import { SUBJECT_TYPE_WORKFORCE_MEMBER } from "@/lib/supabase/types";
import { WorkforceRosterTable } from "@/components/workforce/WorkforceRosterTable";
import { SyncNowButton } from "@/components/workforce/SyncNowButton";
import { SyncComplianceActionsButton } from "@/components/workforce/SyncComplianceActionsButton";
import { WorkforceAttentionDashboard } from "@/components/workforce/WorkforceAttentionDashboard";
import { WorkforceSubNav } from "@/components/workforce/WorkforceSubNav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkforcePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const [{ filter }, roster, reviewQueue, profile] = await Promise.all([
    searchParams,
    getWorkforceRoster(),
    getIdentityReviewQueue(SUBJECT_TYPE_WORKFORCE_MEMBER, "proposed"),
    getCurrentAuthorizedUser(),
  ]);

  const ready = roster.filter((r) => r.attentionState.state === "ready").length;

  return (
    <PageContainer title="Workforce">
      <WorkforceSubNav active="overview" />
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light text-body">Workforce</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            What needs your attention today — everything else stays one click away.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-sans text-sm text-muted">
            {roster.length} {roster.length === 1 ? "caregiver" : "caregivers"} · {ready} ready
          </span>
          {canAccessWorkforceDocuments(profile?.role ?? null) && (
            <Link
              href="/workforce/import"
              className="rounded-lg border border-ivory-border px-4 py-2 font-sans text-sm font-medium text-muted hover:border-navy/20 hover:text-body"
            >
              Bulk Import
            </Link>
          )}
          {canTriggerAxisCareSync(profile?.role ?? null) && (
            <>
              <SyncComplianceActionsButton />
              <SyncNowButton />
            </>
          )}
        </div>
      </div>

      {roster.length === 0 && reviewQueue.length === 0 ? (
        <div className="rounded-xl border border-ivory-border bg-surface px-8 py-16 text-center shadow-card">
          <p className="font-serif text-xl text-muted">No caregivers synced yet</p>
          <p className="mt-2 font-sans text-sm text-muted">
            Run an AxisCare sync to bring in the active caregiver roster.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <WorkforceAttentionDashboard roster={roster} />
          <WorkforceRosterTable roster={roster} identityReviewCount={reviewQueue.length} defaultFilter={filter} />
        </div>
      )}
    </PageContainer>
  );
}
