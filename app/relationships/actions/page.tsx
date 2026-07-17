import { PageContainer } from "@/components/PageContainer";
import { getRelationshipBoardRows, getRecentlyCompletedActions } from "@/lib/data/relationships";
import { getRelationshipAttentionStatus } from "@/lib/relationships/attention";
import { ActionBoard, type ActionBoardRow, type RecentlyCompletedWithName } from "@/components/relationships/ActionBoard";
import { RelationshipViewTabs } from "@/components/relationships/RelationshipViewTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipActionBoardPage() {
  const [boardRows, recentlyCompletedRaw] = await Promise.all([
    getRelationshipBoardRows(),
    getRecentlyCompletedActions(),
  ]);

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
    <PageContainer title="Daily Action Board">
      <RelationshipViewTabs active="actions" />
      <div className="mb-6">
        <h1 className="font-serif text-page-title font-light text-body">Daily Action Board</h1>
        <p className="mt-1 font-sans text-base text-muted">
          See what needs attention and move every relationship forward.
        </p>
      </div>

      <ActionBoard rows={rows} recentlyCompleted={recentlyCompleted} />
    </PageContainer>
  );
}
