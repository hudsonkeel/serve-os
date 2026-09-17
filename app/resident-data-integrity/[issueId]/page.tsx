import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { getIntegrityIssueById, getIssueMemberResidentIds } from "@/lib/data/residentDataIntegrity";
import { getLinkedRecordCounts, getResidentsForComparison } from "@/lib/data/residentIdentity";
import { ResidentDataIntegrityDetail } from "@/components/residentDataIntegrity/ResidentDataIntegrityDetail";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Security hotfix (fix/resident-identity-authorization) — see
// app/resident-data-integrity/page.tsx's own comment. Same gate, checked
// before this specific issue's resident-comparison data is ever fetched.
export default async function ResidentDataIntegrityIssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const profile = await getCurrentAuthorizedUser();
  if (!canPerformReconciliationActions(profile?.role ?? null)) {
    return (
      <PageContainer title="Resident Data Integrity Review">
        <p className="font-sans text-sm text-muted">You do not have permission to view Resident Data Integrity.</p>
      </PageContainer>
    );
  }

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
