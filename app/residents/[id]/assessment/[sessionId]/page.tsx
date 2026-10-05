import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { getCommunityResidentById } from "@/lib/data/communityMetrics";
import { getAssessmentReviewData } from "@/lib/actions/assessmentIntelligence";
import { AssessmentReviewPanel } from "@/components/assessment/AssessmentReviewPanel";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { CAPTURED_SESSION_STATUS, capturedAssessmentNotice, isCapturedTranscriptionEnabled } from "@/lib/assessmentCapture/captureLogic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AssessmentReviewPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;

  // Resident-specific URL — must not bypass scope, same as
  // /residents/[id] itself (Phase E/F, section 6).
  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const record = await getCommunityResidentById(id, communityFilter);
  if (!record) notFound();

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

  // Assessment Mobile Capture v0.1: a 'captured' session has audio but no transcript or facts
  // yet — there is nothing to review, and it must never be approvable as an empty assessment.
  if (reviewData.session.status === CAPTURED_SESSION_STATUS) {
    const notice = capturedAssessmentNotice(isCapturedTranscriptionEnabled({ isSyntheticTest: reviewData.session.is_synthetic_test === true }));
    return (
      <PageContainer title={`Assessment Review — ${record.residentDisplayName}`}>
        <p className="font-sans text-sm text-body">
          {notice.title}. {notice.detail}
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={`Assessment Review — ${record.residentDisplayName}`}>
      <AssessmentReviewPanel
        residentId={id}
        residentName={record.residentDisplayName}
        assessmentSessionId={sessionId}
        sessionStatus={reviewData.session.status}
        exceptions={reviewData.reviewSummary.exceptions}
        clearFacts={reviewData.reviewSummary.clearFacts}
        coverage={reviewData.coverage}
        canonicalProfileFacts={reviewData.canonicalProfileFacts}
        approvedSnapshot={reviewData.approvedSnapshot}
      />
    </PageContainer>
  );
}
