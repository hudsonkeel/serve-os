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
import { getInfectionById } from "@/lib/data/infections";
import { getResidentById } from "@/lib/data/residents";
import { getOpenCorrectiveActionForInfection } from "@/lib/data/complianceCorrectiveActions";
import { formatCentralDateTime } from "@/lib/utils/date";
import { ReviewInfectionForm } from "@/components/infections/ReviewInfectionForm";
import { ResolveInfectionForm } from "@/components/infections/ResolveInfectionForm";
import { CreateSourceLinkedCorrectiveActionButton } from "@/components/compliance/CreateSourceLinkedCorrectiveActionButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return formatCentralDateTime(iso) ?? iso;
}

// disclosed_at is a plain date — formatted from its own y/m/d components,
// same reasoning as app/qapi/infections/page.tsx's formatDisclosedDate.
function fmtDisclosedDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function InfectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, getCurrentAuthorizedUser()]);

  if (!canViewIncidentsAndInfections(profile?.role ?? null)) {
    return (
      <PageContainer title="Infection Record">
        <p className="font-sans text-sm text-muted">You do not have permission to view this infection record.</p>
      </PageContainer>
    );
  }

  const infection = await getInfectionById(id);
  if (!infection) notFound();

  // Same scope discipline as the Incident detail page — a record outside
  // the viewer's current single-community context reads as not found.
  const filter = await resolveCurrentCommunityQueryFilter(profile);
  if (filter.mode === "none") notFound();
  if (filter.mode === "single" && infection.community_id !== filter.communityId) notFound();

  const resident = await getResidentById(infection.resident_id);

  const canReview = canReviewIncidentOrInfection(profile?.role ?? null);
  const canResolve = canResolveIncidentOrInfection(profile?.role ?? null);
  const canManageAction = canManageCorrectiveActions(profile?.role ?? null);

  // Governance Connective Slice v0.1 — see the Incident detail page for
  // the identical rule this mirrors.
  const correctiveActionEligible = infection.status === "open" && infection.review_status === "reviewed" && infection.follow_up_required;
  const linkedCorrectiveAction = correctiveActionEligible ? await getOpenCorrectiveActionForInfection(infection.id) : null;

  return (
    <PageContainer title="Infection Record">
      <div className="mb-6">
        <Link href="/qapi/infections" className="font-sans text-sm text-navy hover:text-navy-light">
          ← Infections
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-3xl font-light text-body">
              {resident ? (
                <Link href={`/residents/${resident.id}`} className="text-navy hover:text-navy-light">
                  {resident.display_name || resident.full_name || "Resident"}
                </Link>
              ) : (
                "Infection Record"
              )}
            </h1>
            <p className="mt-1 font-sans text-sm text-muted">Disclosed {fmtDisclosedDate(infection.disclosed_at)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={infection.status === "resolved" ? "success" : "blue"}>
              {infection.status === "resolved" ? "Resolved" : "Open"}
            </Badge>
            <Badge tone={infection.review_status === "reviewed" ? "neutral" : "warning"}>
              {infection.review_status === "reviewed" ? "Reviewed" : "Needs Review"}
            </Badge>
            {infection.follow_up_required && <Badge tone="warning">Follow-up Required</Badge>}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* ─── A. Infection record / disclosed facts — never edited by review/resolution below. ─── */}
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Disclosed Facts</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
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
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Date Disclosed to Serve</dt>
              <dd className="mt-0.5 font-sans text-sm text-body">{fmtDisclosedDate(infection.disclosed_at)}</dd>
            </div>
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Disclosed / Reported By</dt>
              <dd className="mt-0.5 font-sans text-sm text-body">{infection.disclosed_by || "—"}</dd>
            </div>
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Recorded By</dt>
              <dd className="mt-0.5 font-sans text-sm text-body">{infection.created_by}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">
              Infection / Condition Information (as disclosed)
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{infection.condition_description}</dd>
          </div>
        </section>

        {/* ─── B. Treatment / additional factual information ─── */}
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">
            Treatment &amp; Additional Information
          </h2>
          <div className="mt-3 space-y-3">
            <div>
              <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">
                Treatment (as disclosed by the client)
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{infection.treatment_description || "—"}</dd>
            </div>
            {infection.notes && (
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Notes</dt>
                <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{infection.notes}</dd>
              </div>
            )}
          </div>
        </section>

        {/* ─── C. Review & follow-up ─── */}
        <section className="rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Review &amp; Follow-up</h2>

          {infection.review_status === "reviewed" ? (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Reviewed By</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{infection.reviewed_by}</dd>
              </div>
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Reviewed Date</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{fmtDateTime(infection.reviewed_at)}</dd>
              </div>
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Follow-up Required</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{infection.follow_up_required ? "Yes" : "No"}</dd>
              </div>
              {infection.follow_up_required && (
                <div>
                  <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Owner</dt>
                  <dd className="mt-0.5 font-sans text-sm text-body">{infection.owner || "—"}</dd>
                </div>
              )}
            </dl>
          ) : canReview ? (
            <div className="mt-3">
              <ReviewInfectionForm infectionId={infection.id} />
            </div>
          ) : (
            <p className="mt-2 font-sans text-sm text-muted">Awaiting formal review.</p>
          )}
        </section>

        {/* ─── Corrective Action (Governance Connective Slice v0.1) ─── */}
        {correctiveActionEligible && (
          <section className="rounded-xl border border-ivory-border bg-white p-5">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Corrective Action</h2>
            {linkedCorrectiveAction ? (
              <p className="mt-2 font-sans text-sm text-body">
                Tracked: <span className="font-medium">{linkedCorrectiveAction.title}</span>
                {linkedCorrectiveAction.due_at ? ` — due ${fmtDateTime(linkedCorrectiveAction.due_at)}` : ""}
              </p>
            ) : canManageAction ? (
              <div className="mt-3">
                <CreateSourceLinkedCorrectiveActionButton
                  kind="infection"
                  recordId={infection.id}
                  defaultTitle={`Infection follow-up — disclosed ${fmtDisclosedDate(infection.disclosed_at)}`}
                  defaultReason={infection.condition_description}
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

          {infection.status === "resolved" ? (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolved By</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{infection.resolved_by}</dd>
              </div>
              <div>
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolved Date</dt>
                <dd className="mt-0.5 font-sans text-sm text-body">{fmtDateTime(infection.resolved_at)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolution Note</dt>
                <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{infection.resolution_note}</dd>
              </div>
            </dl>
          ) : infection.review_status !== "reviewed" ? (
            <p className="mt-2 font-sans text-sm text-muted">Available once this infection record has been reviewed.</p>
          ) : canResolve ? (
            <div className="mt-3">
              <ResolveInfectionForm infectionId={infection.id} />
            </div>
          ) : (
            <p className="mt-2 font-sans text-sm text-muted">Reviewed — awaiting resolution.</p>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
