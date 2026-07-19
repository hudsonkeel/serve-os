import { PageContainer } from "@/components/PageContainer";
import { getDecisions } from "@/lib/data/decisionEngine";
import { GovernanceWorkspace } from "@/components/governance/GovernanceWorkspace";
import { BACKGROUND_ELIGIBILITY_DOMAIN } from "@/lib/intelligence/domains/compliance/backgroundEligibility/decisionSpec";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GovernancePage() {
  const rows = await getDecisions(BACKGROUND_ELIGIBILITY_DOMAIN);

  return (
    <PageContainer title="Governance">
      <div className="mb-6 rounded-lg border border-amber-200 bg-warning-surface px-4 py-4">
        <p className="font-sans text-label font-semibold uppercase tracking-wide text-warning-text">
          Decision Intelligence demonstration
        </p>
        <p className="mt-1 font-sans text-sm text-body">
          No live workforce evidence connection is configured. Results shown here are fictional and must not be
          used for employment or assignment decisions.
        </p>
      </div>

      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-page-title font-light text-body">Governance</h1>
          <p className="mt-1 font-sans text-base text-muted">
            Explainable Background Eligibility decisions — point-in-time evaluations over recorded evidence, not a
            continuously monitored feed. This is the first Decision Intelligence vertical slice; see{" "}
            <code className="font-mono text-sm">docs/architecture/governance-phase-1-implementation.md</code>.
          </p>
        </div>
        <span className="font-sans text-base font-medium text-muted">
          {rows.length} decision{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <GovernanceWorkspace rows={rows} />
    </PageContainer>
  );
}
