import { PageContainer } from "@/components/PageContainer";
import { getRelationshipBoardRows } from "@/lib/data/relationships";
import { getRelationshipAttentionStatus } from "@/lib/relationships/attention";
import { Whiteboard, type WhiteboardRow } from "@/components/relationships/Whiteboard";
import { RelationshipViewTabs } from "@/components/relationships/RelationshipViewTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipWhiteboardPage() {
  const boardRows = await getRelationshipBoardRows();

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
    <PageContainer title="Operational Whiteboard">
      <RelationshipViewTabs active="whiteboard" />
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Operational Whiteboard</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Where every active relationship currently stands.
          </p>
        </div>
        <span className="font-sans text-base font-medium text-muted">
          {rows.length} relationship{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <Whiteboard rows={rows} />
    </PageContainer>
  );
}
