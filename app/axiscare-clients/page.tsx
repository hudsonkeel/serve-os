import { getAxisCareClientOperationalSummary } from "@/lib/data/axiscareClientOperationalSummary";
import { PageContainer } from "@/components/PageContainer";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { AxisCareClientRoster } from "@/components/peopleWeServe/AxisCareClientRoster";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AxisCareClientsPage() {
  const summary = await getAxisCareClientOperationalSummary();

  return (
    <PageContainer title="The People We Serve · AxisCare Clients">
      <PeopleWeServeTabs active="axiscareClients" />
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">AxisCare Clients</h1>
          <p className="mt-1 font-sans text-base text-muted">
            The live AxisCare client roster, its operational status, and how confidently each record is matched
            to a Serve resident. Operational status (Active / Inactive / Prospect) and Serve identity confidence
            are shown separately — an unresolved identity never removes a real client from its operational bucket.
          </p>
        </div>
        <span className="font-sans text-base font-medium text-muted">{summary.rows.length} AxisCare clients</span>
      </div>

      <AxisCareClientRoster summary={summary} />
    </PageContainer>
  );
}
