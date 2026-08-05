import { PageContainer } from "@/components/PageContainer";
import { RelationshipViewTabs } from "@/components/relationships/RelationshipViewTabs";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { IntakeQueueWorkspace } from "@/components/relationships/IntakeQueueWorkspace";
import {
  getIntakeProcessingRecords,
  getUnprocessedIntakeSubmissions,
} from "@/lib/data/intakeEngine";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { RELATIONSHIPS_CONTEXT } from "@/lib/askServe/areaContexts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function IntakeQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const [newSubmissions, records, profile] = await Promise.all([
    getUnprocessedIntakeSubmissions(),
    getIntakeProcessingRecords(),
    getCurrentAuthorizedUser(),
  ]);
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  return (
    <PageContainer title="The People We Serve · Website Intake">
      <PeopleWeServeTabs active="relationships" />
      <RelationshipViewTabs active="intake" />
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Website Intake</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Submissions from Serve&apos;s website, automatically translated into Relationships, Residents,
            External Clients, and Recruiting — or routed here for review when identity or location can&apos;t be
            confidently determined.
          </p>
        </div>
        {askServeEnabled && (
          <AskServeTrigger
            context={buildAskServeContext(RELATIONSHIPS_CONTEXT, {
              surface: "relationship_intake",
              route: "/relationships/intake",
              pageTitle: "The People We Serve · Website Intake",
              userRole: profile?.role ?? undefined,
            })}
            label="Ask Serve about this intake queue"
          />
        )}
      </div>

      <IntakeQueueWorkspace newSubmissions={newSubmissions} records={records} initialTab={tab} />
    </PageContainer>
  );
}
