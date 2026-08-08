import {
  getResidentServeRelationships,
  type ResidentRelationshipTabValue,
} from "@/lib/data/residentServeRelationships";
import { PageContainer } from "@/components/PageContainer";
import { ResidentsInbox } from "@/components/residents/ResidentsInbox";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { PEOPLE_WE_SERVE_CONTEXT } from "@/lib/askServe/areaContexts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_TABS: ResidentRelationshipTabValue[] = [
  "all",
  "active_client",
  "prospect",
  "inactive_client",
  "no_current_relationship",
  "needs_review",
];

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; wellnessDue?: string }>;
}) {
  const community = await getResidentServeRelationships();
  const profile = await getCurrentAuthorizedUser();
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);
  const canCorrect = canEditResidentProfile(profile?.role);
  const params = await searchParams;
  const initialTab = VALID_TABS.includes(params.tab as ResidentRelationshipTabValue)
    ? (params.tab as ResidentRelationshipTabValue)
    : "all";
  const initialWellnessDue =
    params.wellnessDue === "now" || params.wellnessDue === "week"
      ? params.wellnessDue
      : undefined;

  return (
    <PageContainer title="The People We Serve · Residents">
      <PeopleWeServeTabs active="residents" />
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Residents</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Manage resident records, service status, wellness needs, and operational details.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-sans text-base font-medium text-muted">
            {community.totalResidents} residents
          </span>
          {askServeEnabled && (
            <AskServeTrigger
              context={buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, {
                surface: "residents_list",
                pageTitle: "The People We Serve · Residents",
                subjectType: "resident_collection",
                userRole: profile?.role ?? undefined,
              })}
              label="Ask Serve about these residents"
            />
          )}
        </div>
      </div>

      {community.residentsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Failed to load live residents.
        </div>
      )}

      <ResidentsInbox
        records={community.records}
        relationshipCounts={community.relationshipCounts}
        initialTab={initialTab}
        initialWellnessDue={initialWellnessDue}
        canCorrect={canCorrect}
      />
    </PageContainer>
  );
}
