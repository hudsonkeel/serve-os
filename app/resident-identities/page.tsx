import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { getIdentityCandidates, getResidentsForComparison } from "@/lib/data/residentIdentity";
import { ResidentIdentityQueue } from "@/components/residentIdentity/ResidentIdentityQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Security hotfix (fix/resident-identity-authorization) — this page and
// its detail route previously had NO server-side authorization check at
// all (same gap as app/resident-data-integrity/page.tsx's own comment).
// Gated to canPerformReconciliationActions, checked before any candidate/
// resident data is fetched. Enforced again, independently, inside every
// exported action in lib/actions/residentIdentity.ts.
export default async function ResidentIdentitiesPage() {
  const profile = await getCurrentAuthorizedUser();
  if (!canPerformReconciliationActions(profile?.role ?? null)) {
    return (
      <PageContainer title="Resident Identities">
        <p className="font-sans text-sm text-muted">You do not have permission to view Resident Identities.</p>
      </PageContainer>
    );
  }

  const candidates = await getIdentityCandidates();

  const allResidentIds = [
    ...new Set(
      candidates.flatMap((c) => {
        const evidence = (c.evidence as { residentIdA?: string; residentIdB?: string }[]) ?? [];
        return evidence.flatMap((e) => [e.residentIdA, e.residentIdB].filter(Boolean) as string[]);
      }),
    ),
  ];

  const residents = await getResidentsForComparison(allResidentIds);
  const residentsById = new Map(residents.map((r) => [r.id, r]));

  return (
    <PageContainer title="Resident Identities">
      <p className="mb-6 max-w-3xl font-sans text-body text-muted">
        Serve compares resident records for likely duplicate identities — spelling variants, apartment changes, or
        the same person entered twice. Detection is automatic; nothing here is ever merged without a review decision.
      </p>
      <ResidentIdentityQueue candidates={candidates} residentsById={Object.fromEntries(residentsById)} />
    </PageContainer>
  );
}
