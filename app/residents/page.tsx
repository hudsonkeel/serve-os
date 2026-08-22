import {
  getResidentServeRelationships,
  type ResidentRelationshipTabValue,
} from "@/lib/data/residentServeRelationships";
import { getUnresolvedAxisCareWorkForCommunity } from "@/lib/data/axiscareOperationalState";
import { PageContainer } from "@/components/PageContainer";
import { ResidentsInbox } from "@/components/residents/ResidentsInbox";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { AddClientButton } from "@/components/residents/AddClientButton";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { PEOPLE_WE_SERVE_CONTEXT } from "@/lib/askServe/areaContexts";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";

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
  // Profile/scope must resolve before the residents query — the query
  // itself is the SQL-first community filter (residents.community_id),
  // never a fetch-then-filter. PageContainer resolves this same context
  // again independently for the shell/switcher; the redundant resolution
  // mirrors the existing getCurrentAuthorizedUser() double-call already
  // flagged in the performance baseline, not a new regression.
  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  // Unresolved external work (e.g. an AxisCare prospect with no resident
  // match yet) is fetched alongside — never folded into
  // getResidentServeRelationships() itself, which stays resident-only so
  // every other caller (getAuditEligibleActiveClientResidents, etc.) is
  // unaffected. See lib/data/axiscareOperationalState.ts's own header
  // comment on why this is composed, not merged, into Needs Review.
  const [community, unresolvedExternalWork] = await Promise.all([
    getResidentServeRelationships(communityFilter),
    getUnresolvedAxisCareWorkForCommunity(communityFilter),
  ]);
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
      <div className="mb-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-page-title font-light text-body">Residents</h1>
            <p className="mt-1 font-sans text-base text-muted">
              Manage resident records, service status, wellness needs, and operational details.
            </p>
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <span className="font-sans text-base font-medium text-muted">
              {community.totalResidents} residents
            </span>
            <AddClientButton />
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

        {/* Mobile primary actions — "Find a person" jumps straight to the
            search box below (no separate search UI to build/maintain);
            "New Prospect" bridges to the existing add-prospect flow at
            /relationships (see the completion report for why: no
            single-tap, name-only "new prospect" capture exists anywhere
            in the app yet — this is the closest real, working entry
            point, not a new feature). Mobile-only: desktop already shows
            the count/Ask Serve controls above and the search box is
            already on-screen without scrolling. */}
        <div className="flex gap-3 md:hidden">
          <a
            href="#person-search"
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-navy/20 bg-surface px-4 font-sans text-button font-medium text-navy shadow-card"
          >
            Find a Person
          </a>
          <AddClientButton className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-navy px-4 font-sans text-button font-medium text-white shadow-card" />
        </div>
      </div>

      {community.residentsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          Failed to load live residents.
        </div>
      )}

      {communityFilter.mode === "none" && (
        <div className="rounded-lg border border-navy/15 bg-navy/5 px-4 py-3 font-sans text-sm text-body">
          Select a community above to see its residents. No community is currently selected.
        </div>
      )}

      <ResidentsInbox
        records={community.records}
        relationshipCounts={community.relationshipCounts}
        unresolvedExternalWork={unresolvedExternalWork}
        showCommunityOnExternalWork={communityFilter.mode === "all"}
        initialTab={initialTab}
        initialWellnessDue={initialWellnessDue}
        canCorrect={canCorrect}
      />
    </PageContainer>
  );
}
