import { getAxisCareClientOperationalSummary } from "@/lib/data/axiscareClientOperationalSummary";
import { PageContainer } from "@/components/PageContainer";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { AxisCareClientRoster } from "@/components/peopleWeServe/AxisCareClientRoster";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Serve Clients — the product surface for real Serve clients. Serve
// owns the client relationship; AxisCare is the canonical EXTERNAL
// client repository this page reads from, never described to the user
// as "AxisCare Clients" (a real person is a Serve Client — AxisCare
// appears only as sourcing/sync detail, e.g. "AxisCare #123"). Records
// that don't represent a true operational client (disposition-excluded
// — a related person, an administrative record, a test placeholder)
// are not shown here at all; they live in Reconciliation (/reconciliation).
export default async function ClientsPage() {
  const summary = await getAxisCareClientOperationalSummary();
  const clientCount = summary.rows.filter((row) => row.operationalBucket !== "excluded").length;

  return (
    <PageContainer title="The People We Serve · Serve Clients">
      <PeopleWeServeTabs active="clients" />
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Serve Clients</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Serve owns the client relationship. AxisCare is the canonical external client repository this list is
            sourced from — operational status (Active / Inactive / Prospect) and Serve identity confidence are shown
            separately, and an unresolved identity never removes a real client from its operational bucket.
          </p>
        </div>
        <span className="font-sans text-base font-medium text-muted">{clientCount} Serve Clients</span>
      </div>

      <AxisCareClientRoster summary={summary} />
    </PageContainer>
  );
}
