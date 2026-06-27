import { getCommunityMetrics } from "@/lib/data/communityMetrics";
import { PageContainer } from "@/components/PageContainer";
import { ResidentsInbox } from "@/components/residents/ResidentsInbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResidentsPage() {
  const community = await getCommunityMetrics();

  return (
    <PageContainer title="Residents">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-3xl font-light text-navy">Residents</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            {community.communityName} - every resident, every stage of the relationship
          </p>
        </div>
        <span className="font-sans text-sm text-muted">
          {community.metrics.totalResidents} residents
        </span>
      </div>

      {community.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Failed to load live residents. Showing demo records only.
        </div>
      )}

      <ResidentsInbox
        records={community.residentRecords}
        tabCounts={community.residentTabCounts}
      />
    </PageContainer>
  );
}
