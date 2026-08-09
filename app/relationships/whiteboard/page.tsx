import { PageContainer } from "@/components/PageContainer";
import { getRelationshipBoardRows } from "@/lib/data/relationships";
import { getRelationshipAttentionStatus } from "@/lib/relationships/attention";
import { Whiteboard, type WhiteboardRow } from "@/components/relationships/Whiteboard";
import { RelationshipViewTabs } from "@/components/relationships/RelationshipViewTabs";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { RELATIONSHIPS_CONTEXT } from "@/lib/askServe/areaContexts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipWhiteboardPage() {
  const [boardRows, profile] = await Promise.all([getRelationshipBoardRows(), getCurrentAuthorizedUser()]);
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  const rows: WhiteboardRow[] = boardRows.map((row) => {
    const nearestOpenActionDueAt = row.nearestAction ? row.nearestAction.dueAt : undefined;
    return {
      ...row,
      attentionStatus: getRelationshipAttentionStatus({
        status: row.status,
        relationshipType: row.relationshipType,
        nearestOpenActionDueAt,
      }),
      nearestActionDueAt: nearestOpenActionDueAt ?? null,
    };
  });

  return (
    <PageContainer title="The People We Serve · Whiteboard">
      <PeopleWeServeTabs active="relationships" />
      <RelationshipViewTabs active="whiteboard" />
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Operational Whiteboard</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Where every active relationship currently stands.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-sans text-base font-medium text-muted">
            {rows.length} relationship{rows.length === 1 ? "" : "s"}
          </span>
          {askServeEnabled && (
            <AskServeTrigger
              context={buildAskServeContext(RELATIONSHIPS_CONTEXT, {
                surface: "relationship_whiteboard",
                route: "/relationships/whiteboard",
                pageTitle: "The People We Serve · Whiteboard",
                userRole: profile?.role ?? undefined,
              })}
              label="Ask Serve about this pipeline"
            />
          )}
        </div>
      </div>

      <Whiteboard rows={rows} />
    </PageContainer>
  );
}
