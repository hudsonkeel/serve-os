import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import {
  getCurrentServiceLocationByRelationshipId,
  getRelationshipActions,
  getRelationshipById,
  getRelationshipTimeline,
  getRelationshipTouches,
  getRelationshipWorkingNotes,
  getResidentDisplayNameById,
} from "@/lib/data/relationships";
import { getExternalClientByRelationshipId } from "@/lib/data/externalClients";
import { RELATIONSHIP_TYPE_LABELS } from "@/lib/relationships/constants";
import { RelationshipOverview } from "@/components/relationships/RelationshipOverview";
import { RelationshipActionsList } from "@/components/relationships/RelationshipActionsList";
import { RelationshipWorkingNotesSection } from "@/components/relationships/RelationshipWorkingNotesSection";
import { RelationshipTouchesSection } from "@/components/relationships/RelationshipTouchesSection";
import { RelationshipTimelineSection } from "@/components/relationships/RelationshipTimelineSection";
import { RelationshipServiceLocationSection } from "@/components/relationships/RelationshipServiceLocationSection";
import { ConvertRelationshipPanel } from "@/components/relationships/ConvertRelationshipPanel";
import { ExternalClientPanel } from "@/components/relationships/ExternalClientPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const relationship = await getRelationshipById(id);

  if (!relationship) notFound();

  const [actions, notes, touches, timeline, linkedResidentName, externalClient, currentLocation] = await Promise.all([
    getRelationshipActions(id),
    getRelationshipWorkingNotes(id),
    getRelationshipTouches(id),
    getRelationshipTimeline(id),
    relationship.resident_id ? getResidentDisplayNameById(relationship.resident_id) : Promise.resolve(null),
    getExternalClientByRelationshipId(id),
    getCurrentServiceLocationByRelationshipId(id),
  ]);

  return (
    <PageContainer title={relationship.display_name}>
      <div className="mb-6">
        <Link
          href="/relationships"
          className="inline-flex h-9 items-center font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
        >
          ← Back to Relationships
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="font-serif text-page-title font-light text-body">
          {relationship.display_name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Badge tone="gold">{RELATIONSHIP_TYPE_LABELS[relationship.relationship_type]}</Badge>
          {relationship.status === "on_hold" && <Badge tone="warning">On Hold</Badge>}
          {relationship.status === "closed" && <Badge tone="neutral">Closed</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RelationshipOverview relationship={relationship} linkedResidentName={linkedResidentName} />

          {relationship.relationship_type === "external_prospect" && !externalClient && (
            <RelationshipServiceLocationSection relationshipId={id} location={currentLocation} />
          )}

          {externalClient ? (
            <ExternalClientPanel client={externalClient} />
          ) : (
            <ConvertRelationshipPanel relationship={relationship} currentLocation={currentLocation} />
          )}

          <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipActionsList relationshipId={id} actions={actions} />
          </div>

          <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipWorkingNotesSection relationshipId={id} notes={notes} />
          </div>

          <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipTouchesSection relationshipId={id} touches={touches} />
          </div>
        </div>

        <div className="space-y-6">
          <RelationshipTimelineSection events={timeline} />
        </div>
      </div>
    </PageContainer>
  );
}
