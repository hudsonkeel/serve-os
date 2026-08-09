import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import {
  getCurrentServiceLocationByRelationshipId,
  getInteractionSuggestionsByRelationship,
  getRelationshipActions,
  getRelationshipById,
  getRelationshipCommitments,
  getRelationshipInsights,
  getRelationshipOpenLoops,
  getRelationshipTimeline,
  getRelationshipTouches,
  getRelationshipWorkingNotes,
  getResidentDisplayNameById,
} from "@/lib/data/relationships";
import { getExternalClientByRelationshipId } from "@/lib/data/externalClients";
import { RELATIONSHIP_TYPE_LABELS } from "@/lib/relationships/constants";
import { selectPrimaryOpenAction } from "@/lib/relationships/sorting";
import { generateRelationshipBrief } from "@/lib/relationships/brief";
import { RelationshipOverview } from "@/components/relationships/RelationshipOverview";
import { RelationshipBriefSection } from "@/components/relationships/RelationshipBriefSection";
import { RelationshipNextActionCard } from "@/components/relationships/RelationshipNextActionCard";
import { RelationshipCommitmentsSection } from "@/components/relationships/RelationshipCommitmentsSection";
import { RelationshipOpenLoopsSection } from "@/components/relationships/RelationshipOpenLoopsSection";
import { RelationshipInteractionsSection } from "@/components/relationships/RelationshipInteractionsSection";
import { RelationshipInsightsSection } from "@/components/relationships/RelationshipInsightsSection";
import { RelationshipActionsList } from "@/components/relationships/RelationshipActionsList";
import { RelationshipWorkingNotesSection } from "@/components/relationships/RelationshipWorkingNotesSection";
import { RelationshipTimelineSection } from "@/components/relationships/RelationshipTimelineSection";
import { RelationshipServiceLocationSection } from "@/components/relationships/RelationshipServiceLocationSection";
import { ConvertRelationshipPanel } from "@/components/relationships/ConvertRelationshipPanel";
import { ExternalClientPanel } from "@/components/relationships/ExternalClientPanel";
import { AskServeTrigger } from "@/components/askServe/AskServeTrigger";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { isContextualAskServeEnabled } from "@/lib/askServe/featureFlag";
import { buildAskServeContext } from "@/lib/askServe/buildContext";
import { RELATIONSHIPS_CONTEXT } from "@/lib/askServe/areaContexts";
import { hasTodaysWorkOrigin } from "@/lib/workspace/originMarker";
import { BackToTodaysWorkLink } from "@/components/workspace/BackToTodaysWorkLink";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RelationshipDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const relationship = await getRelationshipById(id);

  if (!relationship) notFound();

  const [actions, notes, interactions, insights, commitments, openLoops, timeline, linkedResidentName, externalClient, currentLocation, interactionSuggestions, profile] =
    await Promise.all([
      getRelationshipActions(id),
      getRelationshipWorkingNotes(id),
      getRelationshipTouches(id),
      getRelationshipInsights(id),
      getRelationshipCommitments(id),
      getRelationshipOpenLoops(id),
      getRelationshipTimeline(id),
      relationship.resident_id ? getResidentDisplayNameById(relationship.resident_id) : Promise.resolve(null),
      getExternalClientByRelationshipId(id),
      getCurrentServiceLocationByRelationshipId(id),
      getInteractionSuggestionsByRelationship(id),
      getCurrentAuthorizedUser(),
    ]);
  const askServeEnabled = isContextualAskServeEnabled(profile?.role ?? null);

  const suggestionsByInteraction: Record<string, typeof interactionSuggestions> = {};
  for (const suggestion of interactionSuggestions) {
    (suggestionsByInteraction[suggestion.source_interaction_id] ??= []).push(suggestion);
  }

  const openActions = actions.filter((a) => a.status === "open");
  const currentNextAction = selectPrimaryOpenAction(
    openActions.map((a) => ({ id: a.id, dueAt: a.due_at, priority: a.priority, createdAt: a.created_at })),
  );
  const currentNextActionRecord = currentNextAction ? actions.find((a) => a.id === currentNextAction.id) ?? null : null;

  const activeInsights = insights.filter((i) => i.status === "active");
  const openCommitments = commitments.filter((c) => c.status === "open");
  const openOpenLoops = openLoops.filter((o) => o.status === "open");

  const brief = generateRelationshipBrief({
    relationship,
    recentInteractions: interactions.slice(0, 5),
    activeInsights,
    openCommitments,
    openLoops: openOpenLoops,
    currentNextAction: currentNextActionRecord,
  });

  return (
    <PageContainer title={relationship.display_name}>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/relationships"
          className="inline-flex h-9 items-center font-sans text-sm font-medium text-navy transition-colors hover:text-navy-light"
        >
          ← Back to Relationships
        </Link>
        {hasTodaysWorkOrigin(from) && <BackToTodaysWorkLink />}
      </div>

      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">
            {relationship.display_name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge tone="gold">{RELATIONSHIP_TYPE_LABELS[relationship.relationship_type]}</Badge>
            {relationship.status === "on_hold" && <Badge tone="warning">On Hold</Badge>}
            {relationship.status === "closed" && <Badge tone="neutral">Closed</Badge>}
          </div>
        </div>
        {askServeEnabled && (
          <AskServeTrigger
            context={buildAskServeContext(RELATIONSHIPS_CONTEXT, {
              surface: "relationship_detail",
              route: `/relationships/${id}`,
              pageTitle: relationship.display_name,
              subjectType: "relationship",
              subjectId: id,
              subjectLabel: relationship.display_name,
              userRole: profile?.role ?? undefined,
            })}
            label="Ask Serve about this relationship"
          />
        )}
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

          <RelationshipBriefSection brief={brief} />

          <RelationshipNextActionCard action={currentNextActionRecord} />

          <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipCommitmentsSection commitments={commitments} />
          </div>

          <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipOpenLoopsSection openLoops={openLoops} />
          </div>

          <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipInteractionsSection
              relationshipId={id}
              interactions={interactions}
              suggestionsByInteraction={suggestionsByInteraction}
            />
          </div>

          <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipInsightsSection insights={insights} />
          </div>

          <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipWorkingNotesSection relationshipId={id} notes={notes} />
          </div>

          <div id="next-actions" className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
            <RelationshipActionsList relationshipId={id} actions={actions} />
          </div>

          {relationship.summary && (
            <div className="rounded-xl border border-ivory-border bg-surface p-6 shadow-card">
              <h2 className="mb-1 font-serif text-card-title font-light text-body">Original / Intake Summary</h2>
              <p className="mb-3 font-sans text-sm text-subtle">
                Historical source context from when this relationship was created — not the current living
                understanding. See the Relationship Brief above for that.
              </p>
              <p className="font-sans text-sm text-body">{relationship.summary}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <RelationshipTimelineSection events={timeline} />
        </div>
      </div>
    </PageContainer>
  );
}
