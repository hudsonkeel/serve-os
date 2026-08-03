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
import { IdentityReviewQueue, type IdentityReviewRow } from "@/components/workforce/IdentityReviewQueue";
import { ResolvedIdentityLinkQueue, type ResolvedIdentityReviewRow } from "@/components/workforce/ResolvedIdentityLinkQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkforceIdentityReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "resolved" ? "resolved" : "proposed";

  const [queue, resolved, roster, allAxisCareLinks] = await Promise.all([
    getIdentityReviewQueue(SUBJECT_TYPE_WORKFORCE_MEMBER, "proposed"),
    getResolvedIdentityLinks(SUBJECT_TYPE_WORKFORCE_MEMBER),
    getWorkforceRoster(),
    getAllPersonVendorIdentityLinksForSource(SUBJECT_TYPE_WORKFORCE_MEMBER, "axiscare"),
  ]);

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
    </PageContainer>
  );
}
