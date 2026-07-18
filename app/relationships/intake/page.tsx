import { PageContainer } from "@/components/PageContainer";
import { RelationshipViewTabs } from "@/components/relationships/RelationshipViewTabs";
import { IntakeQueueWorkspace } from "@/components/relationships/IntakeQueueWorkspace";
import {
  getIntakeProcessingRecords,
  getUnprocessedWebsiteIntakeSubmissions,
} from "@/lib/data/intakeEngine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function IntakeQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const [newSubmissions, records] = await Promise.all([
    getUnprocessedWebsiteIntakeSubmissions(),
    getIntakeProcessingRecords(),
  ]);

  return (
    <PageContainer title="Website Intake">
      <RelationshipViewTabs active="intake" />
      <div className="mb-6">
        <h1 className="font-serif text-page-title font-light text-body">Website Intake</h1>
        <p className="mt-1 font-sans text-base text-muted">
          Submissions from Serve&apos;s website, automatically translated into Relationships, Residents,
          External Clients, and Recruiting — or routed here for review when identity or location can&apos;t be
          confidently determined.
        </p>
      </div>

      <IntakeQueueWorkspace newSubmissions={newSubmissions} records={records} initialTab={tab} />
    </PageContainer>
  );
}
