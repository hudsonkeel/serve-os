import Link from "next/link";
import { getAxisCareClientOperationalSummary } from "@/lib/data/axiscareClientOperationalSummary";
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
  const [summary, profile] = await Promise.all([getAxisCareClientOperationalSummary(), getCurrentAuthorizedUser()]);
  const canAct = canPerformReconciliationActions(profile?.role);
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
          <h2 className="mb-3 font-sans text-card-title font-semibold text-body">AxisCare Leads (new — unresolved)</h2>
          <div className="rounded-lg border border-warning-text/30 bg-warning-surface px-4 py-3 font-sans text-sm text-warning-text">
            AxisCare&rsquo;s Leads CRM layer is now in use (confirmed live: a reachable <code>/api/leads</code> resource
            exists with real records). At least one known case shows the same person represented as both an AxisCare
            Lead and an AxisCare Client (Bob Hatch: Lead #30 and Client #23; Pam Hatch: Lead #31 and Client #22) —
            these have not been merged or altered. Lead ingestion and Lead↔Client identity reconciliation are not
            yet built; this is a real gap requiring a business decision before any Lead data is surfaced or linked
            here.
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
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
