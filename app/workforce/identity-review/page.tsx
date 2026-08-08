import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import {
  getAllPersonVendorIdentityLinksForSource,
  getIdentityReviewQueue,
  getResolvedIdentityLinks,
} from "@/lib/data/personVendorIdentityLinks";
import { getWorkforceMemberDisplayName, getWorkforceRoster } from "@/lib/workforce/roster";
import { SUBJECT_TYPE_WORKFORCE_MEMBER } from "@/lib/supabase/types";
import { buildIdentityRejectionWarning, findPotentialDuplicateLinks } from "@/lib/workforce/identityDuplicateDetection";
import { getRecruitingWorkforceReviewQueue } from "@/lib/data/recruitingWorkforceReview";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { IdentityReviewQueue, type IdentityReviewRow } from "@/components/workforce/IdentityReviewQueue";
import { ResolvedIdentityLinkQueue, type ResolvedIdentityReviewRow } from "@/components/workforce/ResolvedIdentityLinkQueue";
import { RecruitingWorkforceLinkActions } from "@/components/reconciliation/RecruitingWorkforceLinkActions";
import { WorkforceSubNav } from "@/components/workforce/WorkforceSubNav";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkforceIdentityReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "resolved" ? "resolved" : "proposed";

  const [queue, resolved, roster, allAxisCareLinks, profile, recruitingWorkforceCandidates] = await Promise.all([
    getIdentityReviewQueue(SUBJECT_TYPE_WORKFORCE_MEMBER, "proposed"),
    getResolvedIdentityLinks(SUBJECT_TYPE_WORKFORCE_MEMBER),
    getWorkforceRoster(),
    getAllPersonVendorIdentityLinksForSource(SUBJECT_TYPE_WORKFORCE_MEMBER, "axiscare"),
    getCurrentAuthorizedUser(),
    getRecruitingWorkforceReviewQueue(),
  ]);
  const canAct = canPerformReconciliationActions(profile?.role);

  const rosterOptions = roster.map((r) => ({ workforceMemberId: r.workforceMemberId, displayName: r.displayName }));

  const rows: IdentityReviewRow[] = await Promise.all(
    queue.map(async (link) => {
      const duplicates = findPotentialDuplicateLinks(link, allAxisCareLinks);
      return {
        link,
        candidateDisplayName: link.subject_id ? await getWorkforceMemberDisplayName(link.subject_id) : null,
        duplicateCandidates: duplicates.map((d) => ({
          linkId: d.id,
          vendorRecordId: d.vendor_record_id,
          displayName: d.vendor_display_name,
          workforceMemberId: d.subject_id,
        })),
        rejectionWarning: buildIdentityRejectionWarning(link, allAxisCareLinks),
      };
    })
  );

  const resolvedRows: ResolvedIdentityReviewRow[] = await Promise.all(
    resolved.map(async (link) => ({
      link,
      candidateDisplayName: link.subject_id ? await getWorkforceMemberDisplayName(link.subject_id) : null,
    }))
  );

  return (
    <PageContainer title="Workforce Identity Review">
      <WorkforceSubNav active="identity-review" />
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-light text-body">Identity Review</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          AxisCare caregivers awaiting confirmation before appearing in the Workforce roster. A match is never
          confirmed automatically — every link requires an explicit human decision.
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        <Link
          href="/workforce/identity-review"
          className={`rounded-lg px-4 py-2 font-sans text-sm font-medium ${
            activeTab === "proposed" ? "bg-navy text-white" : "border border-ivory-border text-muted hover:border-navy/20"
          }`}
        >
          Awaiting review ({rows.length})
        </Link>
        <Link
          href="/workforce/identity-review?tab=resolved"
          className={`rounded-lg px-4 py-2 font-sans text-sm font-medium ${
            activeTab === "resolved" ? "bg-navy text-white" : "border border-ivory-border text-muted hover:border-navy/20"
          }`}
        >
          Resolved decisions ({resolvedRows.length})
        </Link>
      </div>

      {activeTab === "proposed" ? (
        <IdentityReviewQueue rows={rows} rosterOptions={rosterOptions} />
      ) : (
        <ResolvedIdentityLinkQueue rows={resolvedRows} />
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-sans text-card-title font-semibold text-body">Recruiting ↔ Workforce identity</h2>
          <span className="rounded-full bg-ivory-warm px-2.5 py-0.5 font-sans text-label font-semibold text-muted">
            {recruitingWorkforceCandidates.length}
          </span>
        </div>
        <p className="mb-3 font-sans text-sm text-muted">
          Recruiting leads still showing as active pipeline work whose name resembles an existing workforce
          member — a recruiting record that was likely never closed out after the person was actually hired.
          Never auto-linked: the deterministic matcher only resolves on an exact email/phone match against an
          already-active workforce member, so most pairs here need a human to actually look at both records
          before confirming.
        </p>
        <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
          {recruitingWorkforceCandidates.length > 0 ? (
            <div className="divide-y divide-ivory-border">
              {recruitingWorkforceCandidates.map((pair) => {
                const leadName = [pair.lead.first_name, pair.lead.last_name].filter(Boolean).join(" ") || "(no name)";
                return (
                  <div key={`${pair.lead.id}:${pair.workforceMember.id}`} className="px-6 py-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                          Recruiting Lead
                        </p>
                        <p className="mt-1 font-sans text-card-title font-semibold text-body">{leadName}</p>
                        <p className="font-sans text-sm text-muted">
                          Status: {pair.lead.status} · {pair.lead.email ?? "no email"} · {pair.lead.phone ?? "no phone"}
                        </p>
                      </div>
                      <div>
                        <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">
                          Workforce Member
                        </p>
                        <p className="mt-1 font-sans text-card-title font-semibold text-body">
                          {pair.workforceMember.display_name}
                        </p>
                        <p className="font-sans text-sm text-muted">
                          Lifecycle: {pair.workforceLifecycleStatus ?? "unknown"} · {pair.workforceMember.primary_email ?? "no email"} ·{" "}
                          {pair.workforceMember.primary_phone ?? "no phone"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 font-sans text-sm text-muted">
                      Match engine: {pair.resolution.basis ?? "no exact match"} — {pair.resolution.reason}
                    </p>
                    {canAct && (
                      <RecruitingWorkforceLinkActions
                        recruitingLeadId={pair.lead.id}
                        workforceMemberId={pair.workforceMember.id}
                        matchBasis={pair.resolution.basis}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-8">
              <EmptyState description="No recruiting/workforce candidate pairs need review." />
            </div>
          )}
        </div>
      </section>
    </PageContainer>
  );
}
