import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { LinkButton } from "@/components/ui/Button";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { canCreateIncidentOrInfection, canViewIncidentsAndInfections } from "@/lib/compliance/permissions";
import { listIncidents } from "@/lib/data/incidents";
import { getResidentsByIds } from "@/lib/data/residents";
import { getWorkforceMembersByIds } from "@/lib/data/workforceMembers";
import { getCorrectiveActionsForIncidents, getEffectivenessReviewsForActions } from "@/lib/data/complianceCorrectiveActions";
import { deriveIncidentOperationalState } from "@/lib/compliance/incidentOperationalState";
import { formatCentralDateTime } from "@/lib/utils/date";
import { INCIDENT_TYPE_LABELS } from "@/components/incidents/incidentLabels";
import { IncidentRegisterTable, type IncidentRowView } from "@/components/incidents/IncidentRegisterTable";
import type { ComplianceCorrectiveAction, CorrectiveActionEffectivenessReview, Incident } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function buildInvolvedLabel(
  incident: Incident,
  residentNameById: Map<string, string>,
  workforceNameById: Map<string, string>
): string {
  const parts: string[] = [];
  if (incident.resident_id) parts.push(residentNameById.get(incident.resident_id) ?? "Unknown client");
  if (incident.workforce_member_id) parts.push(workforceNameById.get(incident.workforce_member_id) ?? "Unknown staff");
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default async function IncidentsRegisterPage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canViewIncidentsAndInfections(profile?.role ?? null)) {
    return (
      <PageContainer title="Incidents">
        <p className="font-sans text-sm text-muted">You do not have permission to view incidents.</p>
      </PageContainer>
    );
  }

  const filter = await resolveCurrentCommunityQueryFilter(profile);
  const incidents = await listIncidents(filter);

  const residentIds = [...new Set(incidents.map((i) => i.resident_id).filter((id): id is string => id !== null))];
  const workforceIds = [
    ...new Set(incidents.map((i) => i.workforce_member_id).filter((id): id is string => id !== null)),
  ];
  const incidentIds = incidents.map((i) => i.id);

  const [residents, workforceMembers, correctiveActions] = await Promise.all([
    getResidentsByIds(residentIds),
    getWorkforceMembersByIds(workforceIds),
    getCorrectiveActionsForIncidents(incidentIds),
  ]);

  const effectivenessReviews = await getEffectivenessReviewsForActions(correctiveActions.map((a) => a.id));

  const residentNameById = new Map(residents.map((r) => [r.id, r.display_name || r.full_name || "Unknown"]));
  const workforceNameById = new Map(workforceMembers.map((w) => [w.id, w.display_name]));

  const actionsByIncidentId = new Map<string, ComplianceCorrectiveAction[]>();
  for (const action of correctiveActions) {
    if (!action.source_incident_id) continue;
    const existing = actionsByIncidentId.get(action.source_incident_id) ?? [];
    existing.push(action);
    actionsByIncidentId.set(action.source_incident_id, existing);
  }
  const reviewsByActionId = new Map<string, CorrectiveActionEffectivenessReview>(
    effectivenessReviews.map((r) => [r.corrective_action_id, r])
  );

  const now = new Date();
  const rows: IncidentRowView[] = incidents.map((incident) => ({
    id: incident.id,
    occurredAtLabel: formatCentralDateTime(incident.occurred_at) ?? incident.occurred_at,
    involvedLabel: buildInvolvedLabel(incident, residentNameById, workforceNameById),
    typeLabel:
      incident.incident_type === "other"
        ? incident.incident_type_other || "Other"
        : INCIDENT_TYPE_LABELS[incident.incident_type],
    operationalState: deriveIncidentOperationalState(
      incident,
      actionsByIncidentId.get(incident.id) ?? [],
      reviewsByActionId,
      now
    ),
    owner: incident.owner,
  }));

  const canCreate = canCreateIncidentOrInfection(profile?.role ?? null);

  return (
    <PageContainer title="Incidents">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <Link href="/qapi" className="font-sans text-sm text-navy hover:text-navy-light">
            ← Quality (QAPI)
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-light text-body">Incidents</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            What happened, who was involved, whether it&apos;s been reviewed, and what&apos;s still open.
          </p>
        </div>
        {canCreate && (
          <LinkButton href="/qapi/incidents/new" variant="primary" className="shrink-0">
            New Incident
          </LinkButton>
        )}
      </div>

      {incidents.length === 0 ? (
        <div className="rounded-xl border border-ivory-border bg-surface px-8 py-16 text-center shadow-card">
          <p className="font-serif text-xl text-muted">No incidents recorded yet</p>
          {canCreate && (
            <p className="mt-2 font-sans text-sm text-muted">
              <Link href="/qapi/incidents/new" className="text-navy hover:text-navy-light">
                Record the first one
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <IncidentRegisterTable rows={rows} />
      )}
    </PageContainer>
  );
}
