import { PageContainer } from "@/components/PageContainer";
import { getExternalClientWorkspaceRows } from "@/lib/data/externalClients";
import { ExternalClientsWorkspace } from "@/components/externalClients/ExternalClientsWorkspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExternalClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  const rows = await getExternalClientWorkspaceRows();

  return (
    <PageContainer title="External Clients">
      <div className="mb-6">
        <h1 className="font-serif text-page-title font-light text-body">External Clients</h1>
        <p className="mt-1 font-sans text-base text-muted">
          Manage prospective and active clients receiving services outside supported communities.
        </p>
      </div>

      <ExternalClientsWorkspace rows={rows} autoOpenAdd={add === "prospect"} />
    </PageContainer>
  );
}
