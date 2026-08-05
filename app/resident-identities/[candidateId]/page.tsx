import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import {
  getCandidateMemberResidentIds,
  getIdentityCandidateById,
  getLinkedRecordCounts,
  getResidentsForComparison,
} from "@/lib/data/residentIdentity";
import { ResidentIdentityComparison } from "@/components/residentIdentity/ResidentIdentityComparison";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResidentIdentityCandidatePage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const candidate = await getIdentityCandidateById(candidateId);
  if (!candidate) notFound();

  const memberIds = await getCandidateMemberResidentIds(candidateId);
  const residents = await getResidentsForComparison(memberIds);
  const linkedCounts = Object.fromEntries(
    await Promise.all(residents.map(async (r) => [r.id, await getLinkedRecordCounts(r.id)] as const)),
  );

  return (
    <PageContainer title="Resident Identity Review">
      <ResidentIdentityComparison candidate={candidate} residents={residents} linkedCounts={linkedCounts} />
    </PageContainer>
  );
}
