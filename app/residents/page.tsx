import {
  getCommunityMetrics,
  ResidentTabValue,
} from "@/lib/data/communityMetrics";
import { PageContainer } from "@/components/PageContainer";
import { ResidentsInbox } from "@/components/residents/ResidentsInbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_TABS: ResidentTabValue[] = [
  "all",
  "active_clients",
  "hold",
  "former_clients",
  "wellness_watch",
];

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; wellnessDue?: string }>;
}) {
  const community = await getCommunityMetrics();
  const params = await searchParams;
  const initialTab = VALID_TABS.includes(params.tab as ResidentTabValue)
    ? (params.tab as ResidentTabValue)
    : "all";
  const initialWellnessDue =
    params.wellnessDue === "now" || params.wellnessDue === "week"
      ? params.wellnessDue
      : undefined;

  return (
    <PageContainer title="Residents">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Residents</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Manage resident records, service status, wellness needs, and operational details.
          </p>
        </div>
        <span className="font-sans text-base font-medium text-muted">
          {community.metrics.totalResidents} residents
        </span>
      </div>

      {community.residentsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Failed to load live residents.
        </div>
      )}

      <ResidentsInbox
        records={community.residentRecords}
        tabCounts={community.residentTabCounts}
        initialTab={initialTab}
        initialWellnessDue={initialWellnessDue}
      />
    </PageContainer>
  );
}
