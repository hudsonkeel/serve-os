import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { getIntegrityIssueById, getIssueMemberResidentIds } from "@/lib/data/residentDataIntegrity";
import { getLinkedRecordCounts, getResidentsForComparison } from "@/lib/data/residentIdentity";
import { ResidentDataIntegrityDetail } from "@/components/residentDataIntegrity/ResidentDataIntegrityDetail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResidentDataIntegrityIssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = await params;
  const issue = await getIntegrityIssueById(issueId);
  if (!issue) notFound();

  const memberIds = await getIssueMemberResidentIds(issueId);
  const residents = await getResidentsForComparison(memberIds);
  const linkedCounts = Object.fromEntries(
    await Promise.all(residents.map(async (r) => [r.id, await getLinkedRecordCounts(r.id)] as const)),
  );

  return (
    <PageContainer title="Resident Data Integrity Review">
      <ResidentDataIntegrityDetail issue={issue} residents={residents} linkedCounts={linkedCounts} />
    </PageContainer>
  );
}
