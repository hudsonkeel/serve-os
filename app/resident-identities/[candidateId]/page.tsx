import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import {
  getCandidateMemberResidentIds,
  getIdentityCandidateById,
  getLinkedRecordCounts,
  getResidentsForComparison,
} from "@/lib/data/residentIdentity";
import { getResidentServeRelationshipDetail } from "@/lib/data/residentServeRelationships";
import { getPersonDocumentsForSubject } from "@/lib/data/personDocuments";
import { getPersonEvidenceForSubject } from "@/lib/data/personEvidence";
import { SUBJECT_TYPE_RESIDENT } from "@/lib/supabase/types";
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
  // Relationship detail is computed from the live, currently-active
  // roster (see communityMetrics.ts) — an inactive/archived duplicate
  // naturally has none, which the comparison UI shows honestly rather
  // than guessing.
  const relationshipDetails = Object.fromEntries(
    await Promise.all(residents.map(async (r) => [r.id, await getResidentServeRelationshipDetail(r.id)] as const)),
  );
  const documentEvidenceCounts = Object.fromEntries(
    await Promise.all(
      residents.map(async (r) => {
        const [documents, evidence] = await Promise.all([
          getPersonDocumentsForSubject(SUBJECT_TYPE_RESIDENT, r.id),
          getPersonEvidenceForSubject(SUBJECT_TYPE_RESIDENT, r.id),
        ]);
        return [r.id, { documents: documents.length, evidence: evidence.length }] as const;
      }),
    ),
  );

  return (
    <PageContainer title="Resident Identity Review">
      <ResidentIdentityComparison
        candidate={candidate}
        residents={residents}
        linkedCounts={linkedCounts}
        relationshipDetails={relationshipDetails}
        documentEvidenceCounts={documentEvidenceCounts}
      />
    </PageContainer>
  );
}
