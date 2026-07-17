import { PageContainer } from "@/components/PageContainer";
import {
  getNearestOpenActionByRelationship,
  getRelationshipWorkspaceRows,
} from "@/lib/data/relationships";
import { getRelationshipAttentionStatus } from "@/lib/relationships/attention";
import { RelationshipTableRow } from "@/components/relationships/RelationshipsWorkspace";
import { RelationshipsWorkspace } from "@/components/relationships/RelationshipsWorkspace";
import { RelationshipViewTabs } from "@/components/relationships/RelationshipViewTabs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipsPage() {
  const [rows, nearestActions] = await Promise.all([
    getRelationshipWorkspaceRows(),
    getNearestOpenActionByRelationship(),
  ]);

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
    <PageContainer title="Relationships">
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
        <span className="font-sans text-base font-medium text-muted">
          {tableRows.length} relationship{tableRows.length === 1 ? "" : "s"}
        </span>
      </div>

      <RelationshipsWorkspace rows={tableRows} />
    </PageContainer>
  );
}
