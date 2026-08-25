import { notFound, redirect } from "next/navigation";
import { getCommunityResidentById } from "@/lib/data/communityMetrics";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canEditResidentProfile } from "@/lib/auth/permissions";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { getOrStartNativeCaptureSession } from "@/lib/actions/assessmentCapture";
import { CaptureScreen } from "@/components/residents/assessment/CaptureScreen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Native Serve OS capture route — /residents/{id}/assessment/capture. Authorization and
// resident/session binding both happen here, server-side, before any client code runs:
// the resident is verified to exist (notFound() otherwise — never a manufacturable
// association), the user's permission is checked, and the recording session is created (or
// resumed) against THIS resident id specifically. See lib/actions/assessmentCapture.ts's
// header comment for why every subsequent action re-verifies this same binding.
export default async function AssessmentCapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const record = await getCommunityResidentById(id, communityFilter);

  if (!record) notFound();

  if (!canEditResidentProfile(profile?.role)) {
    redirect(`/residents/${id}`);
  }

  const { session, error } = await getOrStartNativeCaptureSession(id);

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy px-6 text-center">
        <p className="font-sans text-sm text-white/80">{error ?? "Could not start assessment capture."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy">
      <CaptureScreen residentId={id} residentDisplayName={record.residentDisplayName} initialSession={session} />
    </div>
  );
}
