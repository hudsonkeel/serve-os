import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { getCommunityMetrics } from "@/lib/data/communityMetrics";
import { WellnessObservationQuickAction } from "@/components/residents/WellnessObservationQuickAction";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecordWellnessObservationPage() {
  // Part of the community-scoped People We Serve surface — picking a
  // resident to record an observation for should offer the current
  // community's residents, same as /residents itself.
  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const community = await getCommunityMetrics(communityFilter);

  return (
    <PageContainer title="Record Wellness Observation">
      <div className="mb-6">
        <Link
          href="/workspace"
          className="font-sans text-xs text-muted transition-colors hover:text-body"
        >
          Back to Today&apos;s Work
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="font-serif text-3xl font-light text-body">
          Record Wellness Observation
        </h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Search for a resident and record a wellness change.
        </p>
      </div>

      <div className="max-w-2xl rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
        <WellnessObservationQuickAction records={community.residentRecords} />
      </div>
    </PageContainer>
  );
}
