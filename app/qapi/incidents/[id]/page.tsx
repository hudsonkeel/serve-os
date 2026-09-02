import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import {
  canReviewIncidentOrInfection,
  canResolveIncidentOrInfection,
  canViewIncidentsAndInfections,
  canManageCorrectiveActions,
} from "@/lib/compliance/permissions";
import { getIncidentById } from "@/lib/data/incidents";
import { getResidentById } from "@/lib/data/residents";
import { getWorkforceMemberById } from "@/lib/data/workforceMembers";
import { getOpenCorrectiveActionForIncident } from "@/lib/data/complianceCorrectiveActions";
import { formatCentralDateTime } from "@/lib/utils/date";
import { INCIDENT_TYPE_LABELS } from "@/components/incidents/incidentLabels";
import { ReviewIncidentForm } from "@/components/incidents/ReviewIncidentForm";
import { ResolveIncidentForm } from "@/components/incidents/ResolveIncidentForm";
import { CreateSourceLinkedCorrectiveActionButton } from "@/components/compliance/CreateSourceLinkedCorrectiveActionButton";
import { ResolveCorrectiveActionButton } from "@/components/compliance/ResolveCorrectiveActionButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return formatCentralDateTime(iso) ?? iso;
}

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, getCurrentAuthorizedUser()]);

  if (!canViewIncidentsAndInfections(profile?.role ?? null)) {
    return (
      <PageContainer title="Incident">
        <p className="font-sans text-sm text-muted">You do not have permission to view this incident.</p>
      </PageContainer>
    );
  }

  const incident = await getIncidentById(id);
  if (!incident) notFound();

  // Same scope discipline as the register list and getIncidentAction — a
  // record outside the viewer's current single-community context reads as
  // not found.
  const filter = await resolveCurrentCommunityQueryFilter(profile);
  if (filter.mode === "none") notFound();
  if (filter.mode === "single" && incident.community_id !== filter.communityId) notFound();

  const [resident, workforceMember] = await Promise.all([
    incident.resident_id ? getResidentById(incident.resident_id) : Promise.resolve(null),
    incident.workforce_member_id ? getWorkforceMemberById(incident.workforce_member_id) : Promise.resolve(null),
  ]);

  const canReview = canReviewIncidentOrInfection(profile?.role ?? null);
  const canResolve = canResolveIncidentOrInfection(profile?.role ?? null);
  const canManageAction = canManageCorrectiveActions(profile?.role ?? null);
  const typeLabel =
    incident.incident_type === "other" ? incident.incident_type_other || "Other" : INCIDENT_TYPE_LABELS[incident.incident_type];

  // Governance Connective Slice v0.1 — eligible to CREATE a new source-linked
  // corrective action once reviewed, still open, and flagged as needing
  // follow-up. Never automatic — see CreateSourceLinkedCorrectiveActionButton.
  const correctiveActionEligible = incident.status === "open" && incident.review_status === "reviewed" && incident.follow_up_required;
  // Today's Work Actionability slice — fetched unconditionally, not gated
  // on correctiveActionEligible: an already-linked open corrective Action
  // must keep showing (and stay resolvable) here even after the Incident
  // itself resolves, since Today's Work's own corrective_action WorkItem
  // routes back to this exact page for as long as the Action stays open,
  // independently of the Incident's lifecycle.
  const linkedCorrectiveAction = await getOpenCorrectiveActionForIncident(incident.id);

  return (
    <PageContainer title="Incident">
      <div className="mb-6">
        <Link href="/qapi/incidents" className="font-sans text-sm text-navy hover:text-navy-light">
          ← Incidents
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-3xl font-light text-body">{typeLabel}</h1>
            <p className="mt-1 font-sans text-sm text-muted">{fmt(incident.occurred_at)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={incident.status === "resolved" ? "success" : "blue"}>
              {incident.status === "resolved" ? "Resolved" : "Open"}
            </Badge>
            <Badge tone={incident.review_status === "reviewed" ? "neutral" : "warning"}>
              {incident.review_status === "reviewed" ? "Reviewed" : "Needs Review"}
            </Badge>
            {incident.follow_up_required && <Badge tone="warning">Follow-up Required</Badge>}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* ─── A. Event facts — the factual record, never edited by review/resolution below. ─── */}
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Event Facts</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Occurred</dt>
              <dd className="mt-0.5 font-sans text-sm text-body">{fmt(incident.occurred_at)}</dd>
            </div>
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Location</dt>
              <dd className="mt-0.5 font-sans text-sm text-body">{incident.location || "—"}</dd>
            </div>
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Client</dt>
              <dd className="mt-0.5 font-sans text-sm text-body">
                {resident ? (
                  <Link href={`/residents/${resident.id}`} className="text-navy hover:text-navy-light">
                    {resident.display_name || resident.full_name || "Resident"}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Staff / Caregiver</dt>
              <dd className="mt-0.5 font-sans text-sm text-body">{workforceMember?.display_name || "—"}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">What Happened</dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{incident.description}</dd>
          </div>
        </section>

        {/* ─── B. Immediate response / notifications ─── */}
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">
            Immediate Response &amp; Notifications
          </h2>
          <div className="mt-3 space-y-3">
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Response / Actions Taken</dt>
              <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{incident.immediate_response || "—"}</dd>
            </div>
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Injury / Medical Involvement</dt>
              <dd className="mt-0.5 font-sans text-sm text-body">
                {incident.injury_occurred ? incident.injury_medical_details || "Yes" : "None reported"}
              </dd>
            </div>
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Parties Notified</dt>
              <dd className="mt-1 font-sans text-sm text-body">
                {incident.parties_notified.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {incident.parties_notified.map((party) => (
                      <span key={party} className="rounded-full bg-ivory-warm px-3 py-1 font-sans text-xs text-body">
                        {party}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {incident.notes && (
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Notes</dt>
                <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{incident.notes}</dd>
              </div>
            )}
          </div>
        </section>

        {/* ─── C. Review & follow-up ─── */}
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Review &amp; Follow-up</h2>

          {incident.review_status === "reviewed" ? (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Reviewed By</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{incident.reviewed_by}</dd>
              </div>
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Reviewed Date</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{fmt(incident.reviewed_at)}</dd>
              </div>
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Follow-up Required</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{incident.follow_up_required ? "Yes" : "No"}</dd>
              </div>
              {incident.follow_up_required && (
                <div>
                  <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Owner</dt>
                  <dd className="mt-0.5 font-sans text-sm text-body">{incident.owner || "—"}</dd>
                </div>
              )}
            </dl>
          ) : canReview ? (
            <div className="mt-3">
              <ReviewIncidentForm incidentId={incident.id} />
            </div>
          ) : (
            <p className="mt-2 font-sans text-sm text-muted">Awaiting formal review.</p>
          )}
        </section>

        {/* ─── Corrective Action (Governance Connective Slice v0.1) ───────
            Only rendered when there's a real decision to make: reviewed,
            still open, and flagged as needing follow-up. Never appears —
            and never auto-creates anything — merely because follow-up was
            checked "yes" at review time. */}
        {(linkedCorrectiveAction || correctiveActionEligible) && (
          <section className="rounded-xl border border-ivory-border bg-white p-5">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Corrective Action</h2>
            {linkedCorrectiveAction ? (
              <div className="mt-2 space-y-2">
                <p className="font-sans text-sm text-body">
                  Tracked: <span className="font-medium">{linkedCorrectiveAction.title}</span>
                  {linkedCorrectiveAction.due_at ? ` — due ${fmt(linkedCorrectiveAction.due_at)}` : ""}
                </p>
                {canManageAction ? (
                  <ResolveCorrectiveActionButton actionId={linkedCorrectiveAction.id} actionTitle={linkedCorrectiveAction.title} />
                ) : (
                  <p className="font-sans text-xs text-muted">Your role does not include corrective-action resolution.</p>
                )}
              </div>
            ) : canManageAction ? (
              <div className="mt-3">
                <CreateSourceLinkedCorrectiveActionButton
                  kind="incident"
                  recordId={incident.id}
                  defaultTitle={`Incident follow-up — ${typeLabel}`}
                  defaultReason={incident.description}
                />
              </div>
            ) : (
              <p className="mt-2 font-sans text-sm text-muted">Follow-up required — no corrective action tracked yet.</p>
            )}
          </section>
        )}

        {/* ─── D. Resolution ─── */}
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Resolution</h2>

          {incident.status === "resolved" ? (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolved By</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{incident.resolved_by}</dd>
              </div>
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolved Date</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{fmt(incident.resolved_at)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolution Note</dt>
                <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{incident.resolution_note}</dd>
              </div>
            </dl>
          ) : incident.review_status !== "reviewed" ? (
            <p className="mt-2 font-sans text-sm text-muted">Available once this incident has been reviewed.</p>
          ) : canResolve ? (
            <div className="mt-3">
              <ResolveIncidentForm incidentId={incident.id} />
            </div>
          ) : (
            <p className="mt-2 font-sans text-sm text-muted">Reviewed — awaiting resolution.</p>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
