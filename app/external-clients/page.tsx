import { PageContainer } from "@/components/PageContainer";
import { getExternalClientWorkspaceRows } from "@/lib/data/externalClients";
import { ExternalClientsWorkspace } from "@/components/externalClients/ExternalClientsWorkspace";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { PEOPLE_WE_SERVE_CONTEXT } from "@/lib/askServe/areaContexts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExternalClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  const [rows, profile] = await Promise.all([getExternalClientWorkspaceRows(), getCurrentAuthorizedUser()]);
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  return (
    <PageContainer title="The People We Serve · External Clients">
      <PeopleWeServeTabs active="externalClients" />
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">External Clients</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Manage prospective and active clients receiving services outside supported communities.
          </p>
        </div>
        {askServeEnabled && (
          <AskServeTrigger
            context={buildAskServeContext(PEOPLE_WE_SERVE_CONTEXT, {
              surface: "external_clients_list",
              route: "/external-clients",
              pageTitle: "The People We Serve · External Clients",
              subjectType: "external_client_collection",
              userRole: profile?.role ?? undefined,
            })}
            label="Ask Serve about these clients"
          />
        )}
      </div>

      <ExternalClientsWorkspace rows={rows} autoOpenAdd={add === "prospect"} />
    </PageContainer>
  );
}
