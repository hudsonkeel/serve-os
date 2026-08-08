import Link from "next/link";
import { getAxisCareClientOperationalSummary } from "@/lib/data/axiscareClientOperationalSummary";
import { getAxisCareLeadEvidence } from "@/lib/data/axiscareLeadEvidence";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { PageContainer } from "@/components/PageContainer";
import { PeopleWeServeTabs } from "@/components/peopleWeServe/PeopleWeServeTabs";
import { ReconciliationRow } from "@/components/reconciliation/ReconciliationRow";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Home for vendor records and identity questions that are not yet a
// settled, presentable Serve concept — never rendered as an unusual
// kind of Serve Client (see app/clients/page.tsx, which excludes these
// rows entirely). Nothing on this page is auto-resolved; every action
// here requires a human decision, gated to admin/manager/executive —
// same governance boundary as resident profile edits (enforced again,
// independently, inside every server action in
// lib/actions/reconciliation.ts).
export default async function ReconciliationPage() {
  const [summary, profile, leadEvidence] = await Promise.all([
    getAxisCareClientOperationalSummary(),
    getCurrentAuthorizedUser(),
    getAxisCareLeadEvidence(),
  ]);
  const canAct = canPerformReconciliationActions(profile?.role);
  const leadEvidenceRows = leadEvidence.rows;
  const excludedRows = summary.rows.filter((row) => row.operationalBucket === "excluded");
  const ambiguousIdentityRows = summary.rows.filter(
    (row) => row.operationalBucket !== "excluded" && row.identityStatus === "needs_identity_review"
  );

  return (
    <PageContainer title="The People We Serve · Reconciliation">
      <PeopleWeServeTabs active="reconciliation" />
      <div className="mb-6">
        <h1 className="font-serif text-page-title font-light text-body">Reconciliation</h1>
        <p className="mt-1 font-sans text-base text-muted">
          Vendor records that are not real Serve clients, ambiguous identity matches, and other admin/vendor
          cleanup. Nothing here is resolved automatically — every record requires a human decision.
          {!canAct && " Viewing only — your role does not include reconciliation correction actions."}
        </p>
      </div>

      <div className="space-y-10">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-sans text-card-title font-semibold text-body">
              Excluded AxisCare records
            </h2>
            <span className="rounded-full bg-ivory-warm px-2.5 py-0.5 font-sans text-label font-semibold text-muted">
              {excludedRows.length}
            </span>
          </div>
          <p className="mb-3 font-sans text-sm text-muted">
            AxisCare client records reviewed and marked as not representing a true operational client — a related
            person, an administrative/community record, or a test placeholder. Kept visible with the reviewer&rsquo;s
            rationale rather than deleted or shown as an unusual kind of Serve Client.
          </p>
          <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
            {excludedRows.length > 0 ? (
              <div className="divide-y divide-ivory-border">
                {excludedRows.map((row) => (
                  <ReconciliationRow key={row.axiscareId} row={row} canAct={canAct} showIdentityActions={false} />
                ))}
              </div>
            ) : (
              <div className="px-5 py-8">
                <EmptyState description="No excluded AxisCare records." />
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-sans text-card-title font-semibold text-body">
              Ambiguous identity matches
            </h2>
            <span className="rounded-full bg-ivory-warm px-2.5 py-0.5 font-sans text-label font-semibold text-muted">
              {ambiguousIdentityRows.length}
            </span>
          </div>
          <p className="mb-3 font-sans text-sm text-muted">
            Real Serve Clients (still counted in their Active/Inactive/Prospect bucket on the Serve Clients page)
            whose AxisCare record matched a resident on phone or email, but the name on file disagrees — e.g. a
            shared household line or a nickname/spelling variant. Not auto-linked; requires a human decision before
            the identity link is confirmed.
          </p>
          <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
            {ambiguousIdentityRows.length > 0 ? (
              <div className="divide-y divide-ivory-border">
                {ambiguousIdentityRows.map((row) => (
                  <ReconciliationRow key={row.axiscareId} row={row} canAct={canAct} showIdentityActions={true} />
                ))}
              </div>
            ) : (
              <div className="px-5 py-8">
                <EmptyState description="No ambiguous identity matches." />
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-sans text-card-title font-semibold text-body">AxisCare Lead evidence</h2>
            <span className="rounded-full bg-ivory-warm px-2.5 py-0.5 font-sans text-label font-semibold text-muted">
              {leadEvidenceRows.length}
            </span>
          </div>
          <p className="mb-3 font-sans text-sm text-muted">
            Read-only, live from AxisCare&rsquo;s Leads CRM layer — a Lead is AxisCare vendor terminology for a Serve
            Prospect, never a separate identity. Each Lead is matched against existing residents using the same
            deterministic matcher used for AxisCare Clients; nothing here is auto-linked, auto-merged, or used to
            create a new canonical person. Rows flagged below already have a separate AxisCare Client match for the
            same resident — evidence to review, not a decision made for you.
          </p>
          <div className="rounded-xl border border-ivory-border bg-surface shadow-card">
            {leadEvidenceRows.length > 0 ? (
              <div className="divide-y divide-ivory-border">
                {leadEvidenceRows.map((lead) => (
                  <div key={lead.leadId} className="px-6 py-5">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-sans text-sm text-muted">AxisCare Lead #{lead.leadId}</span>
                      {lead.statusLabel && <span className="font-sans text-sm text-muted">· {lead.statusLabel}</span>}
                    </div>
                    <p className="font-sans text-card-title font-semibold text-body">{lead.name || "(no name on file)"}</p>
                    {lead.residentMatch.residentId ? (
                      <p className="mt-1 font-sans text-sm text-body">
                        Possible match: {lead.residentMatch.residentName} (basis: {lead.residentMatch.basis}
                        {lead.residentMatch.requiresReview ? ", needs review" : ""})
                      </p>
                    ) : (
                      <p className="mt-1 font-sans text-sm text-muted">No Serve resident match found.</p>
                    )}
                    {lead.alsoHasAxisCareClientMatch && (
                      <p className="mt-1 font-sans text-sm text-warning-text">
                        This resident also has AxisCare Client #{lead.alsoHasAxisCareClientMatch.axiscareClientId} (
                        {lead.alsoHasAxisCareClientMatch.identityStatus}) — same person represented in both AxisCare
                        systems. Not merged automatically.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8">
                <EmptyState description="No AxisCare Leads found." />
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-sans text-card-title font-semibold text-body">Other reconciliation queues</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/resident-identities"
              className="rounded-lg border border-ivory-border bg-surface px-4 py-3 font-sans text-sm font-medium text-navy shadow-card hover:bg-ivory"
            >
              Resident Identities — likely-duplicate resident review →
            </Link>
            <Link
              href="/resident-data-integrity"
              className="rounded-lg border border-ivory-border bg-surface px-4 py-3 font-sans text-sm font-medium text-navy shadow-card hover:bg-ivory"
            >
              Resident Data Integrity — import/data-handling defects →
            </Link>
            <Link
              href="/workforce/identity-review"
              className="rounded-lg border border-ivory-border bg-surface px-4 py-3 font-sans text-sm font-medium text-navy shadow-card hover:bg-ivory"
            >
              Workforce Identity Review — AxisCare caregiver &amp; recruiting/workforce identity review →
            </Link>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
