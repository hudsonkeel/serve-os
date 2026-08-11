import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { getCommunityResidentById } from "@/lib/data/communityMetrics";
import { getAssessmentReviewData } from "@/lib/actions/assessmentIntelligence";
import { AssessmentReviewPanel } from "@/components/assessment/AssessmentReviewPanel";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AssessmentReviewPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;

  const record = await getCommunityResidentById(id);
  if (!record) notFound();

  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canEditResidentProfile(profile.role)) {
    return (
      <PageContainer title="Assessment Review">
        <p className="font-sans text-sm text-body">
          You do not have permission to review assessments.
        </p>
      </PageContainer>
    );
  }

  const reviewData = await getAssessmentReviewData(sessionId);
  if (!reviewData || !reviewData.session || reviewData.session.resident_id !== id) notFound();

  return (
    <PageContainer title={`Assessment Review — ${record.residentDisplayName}`}>
      <AssessmentReviewPanel
        residentId={id}
        residentName={record.residentDisplayName}
        assessmentSessionId={sessionId}
        sessionStatus={reviewData.session.status}
        exceptions={reviewData.reviewSummary.exceptions}
        clearFacts={reviewData.reviewSummary.clearFacts}
        readyForApproval={reviewData.reviewSummary.readyForApproval}
      />
    </PageContainer>
  );
}
