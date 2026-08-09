import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { getIntegrityIssues, getIssueMemberResidentIds } from "@/lib/data/residentDataIntegrity";
import { getResidentsForComparison } from "@/lib/data/residentIdentity";
import { ResidentDataIntegrityQueue } from "@/components/residentDataIntegrity/ResidentDataIntegrityQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResidentDataIntegrityPage() {
  const issues = await getIntegrityIssues();

  const memberIdsByIssue = Object.fromEntries(
    await Promise.all(issues.map(async (i) => [i.id as string, await getIssueMemberResidentIds(i.id as string)] as const)),
  );

  const allResidentIds = [...new Set(Object.values(memberIdsByIssue).flat())];
  const residents = await getResidentsForComparison(allResidentIds);
  const residentsById = Object.fromEntries(residents.map((r) => [r.id, r]));

  return (
    <PageContainer title="Resident Data Integrity">
      <p className="mb-6 max-w-3xl font-sans text-body text-muted">
        Serve flags resident records that were parsed, normalized, or written incorrectly — the same import writing
        one person twice, a source row repeated before a resident was ever created, an invalid phone number, or a
        structural name defect. This is separate from{" "}
        <Link href="/resident-identities" className="underline">
          Resident Identities
        </Link>
        , which answers &quot;is this the same human?&quot; — these issues are about bad data handling, not identity
        uncertainty. Detection is automatic; nothing is ever changed without a review decision.
      </p>
      <ResidentDataIntegrityQueue issues={issues} memberIdsByIssue={memberIdsByIssue} residentsById={residentsById} />
    </PageContainer>
  );
}
