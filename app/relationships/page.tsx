import { PageContainer } from "@/components/PageContainer";
import {
  getNearestOpenActionByRelationship,
  getRelationshipWorkspaceRows,
} from "@/lib/data/relationships";
import { getRelationshipAttentionStatus } from "@/lib/relationships/attention";
import { RelationshipTableRow } from "@/components/relationships/RelationshipsWorkspace";
import { RelationshipsWorkspace } from "@/components/relationships/RelationshipsWorkspace";
import { RelationshipViewTabs } from "@/components/relationships/RelationshipViewTabs";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { RELATIONSHIPS_CONTEXT } from "@/lib/askServe/areaContexts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipsPage() {
  const [rows, nearestActions, profile] = await Promise.all([
    getRelationshipWorkspaceRows(),
    getNearestOpenActionByRelationship(),
    getCurrentAuthorizedUser(),
  ]);
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  const tableRows: RelationshipTableRow[] = rows.map((row) => {
    const nearestAction = nearestActions.get(row.id);
    const nearestOpenActionDueAt = nearestAction ? nearestAction.dueAt : undefined;

    return {
      ...row,
      nearestActionTitle: nearestAction?.title ?? null,
      nearestActionDueAt: nearestOpenActionDueAt ?? null,
      attentionStatus: getRelationshipAttentionStatus({
        status: row.status,
        relationshipType: row.relationshipType,
        nearestOpenActionDueAt,
      }),
    };
  });

  return (
    <PageContainer title="The People We Serve · Relationships">
      <PeopleWeServeTabs active="relationships" />
      <RelationshipViewTabs active="all" />
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">
            Relationships
          </h1>
          <p className="mt-1 font-sans text-base text-muted">
            Track prospects, follow-ups, and important Serve relationships.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-sans text-base font-medium text-muted">
            {tableRows.length} relationship{tableRows.length === 1 ? "" : "s"}
          </span>
          {askServeEnabled && (
            <AskServeTrigger
              context={buildAskServeContext(RELATIONSHIPS_CONTEXT, {
                surface: "relationships_list",
                userRole: profile?.role ?? undefined,
              })}
              label="Ask Serve about these relationships"
            />
          )}
        </div>
      </div>

      <RelationshipsWorkspace rows={tableRows} />
    </PageContainer>
  );
}
