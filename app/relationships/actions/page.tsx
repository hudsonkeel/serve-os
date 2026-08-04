import { PageContainer } from "@/components/PageContainer";
import { getRelationshipBoardRows, getRecentlyCompletedActions } from "@/lib/data/relationships";
import { getRelationshipAttentionStatus } from "@/lib/relationships/attention";
import { ActionBoard, type ActionBoardRow, type RecentlyCompletedWithName } from "@/components/relationships/ActionBoard";
import { RelationshipViewTabs } from "@/components/relationships/RelationshipViewTabs";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { RELATIONSHIPS_CONTEXT } from "@/lib/askServe/areaContexts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipActionBoardPage() {
  const [boardRows, recentlyCompletedRaw, profile] = await Promise.all([
    getRelationshipBoardRows(),
    getRecentlyCompletedActions(),
    getCurrentAuthorizedUser(),
  ]);
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  const displayNameById = new Map(boardRows.map((row) => [row.id, row.displayName]));

  const rows: ActionBoardRow[] = boardRows.map((row) => {
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

  const recentlyCompleted: RecentlyCompletedWithName[] = recentlyCompletedRaw.map((item) => ({
    ...item,
    relationshipDisplayName: displayNameById.get(item.relationshipId) ?? "Relationship",
  }));

  return (
    <PageContainer title="The People We Serve · Action Board">
      <PeopleWeServeTabs active="relationships" />
      <RelationshipViewTabs active="actions" />
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Daily Action Board</h1>
          <p className="mt-1 font-sans text-base text-muted">
            See what needs attention and move every relationship forward.
          </p>
        </div>
        {askServeEnabled && (
          <AskServeTrigger
            context={buildAskServeContext(RELATIONSHIPS_CONTEXT, {
              surface: "relationship_action_board",
              route: "/relationships/actions",
              pageTitle: "The People We Serve · Action Board",
              userRole: profile?.role ?? undefined,
            })}
            label="Ask Serve about today's follow-ups"
          />
        )}
      </div>

      <ActionBoard rows={rows} recentlyCompleted={recentlyCompleted} />
    </PageContainer>
  );
}
