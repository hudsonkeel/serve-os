import { PageContainer } from "@/components/PageContainer";
import { getIdentityCandidates, getResidentsForComparison } from "@/lib/data/residentIdentity";
import { ResidentIdentityQueue } from "@/components/residentIdentity/ResidentIdentityQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResidentIdentitiesPage() {
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
