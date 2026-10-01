import { notFound } from "next/navigation";
import Link from "next/link";
import { getCommunityResidentById } from "@/lib/data/communityMetrics";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canCaptureResidentAssessment } from "@/lib/auth/permissions";
import { resolveCurrentCommunityQueryFilter } from "@/lib/auth/currentCommunity";
import { getNativeCaptureStartState } from "@/lib/actions/nativeAssessmentCapture";
import { CaptureScreen } from "@/components/residents/assessment/CaptureScreen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Assessment Mobile Capture — native in-browser recorder, opened by the normal
// Assessment/Reassessment button. Same permission as that button (canCaptureResidentAssessment).
// Authorization and resident scope are enforced here, server-side, before any client code runs
// (a resident outside the caller's community scope is notFound(), same as /residents/[id]).
// Rendering this page never creates a session — it only looks up whether a native in-progress
// session can be resumed. A session is created only when the assessor taps Start (see
// startOrResumeNativeCapture), so a prefetch or a stray visit leaves no data behind.
export default async function AssessmentCapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const profile = await getCurrentAuthorizedUser();
  const communityFilter = await resolveCurrentCommunityQueryFilter(profile);
  const record = await getCommunityResidentById(id, communityFilter);
  if (!record) notFound();

  const message = (text: string) => (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-sans text-sm text-body">{text}</p>
      <Link href={`/residents/${id}`} className="rounded-lg border border-ivory-border px-5 py-2 font-sans text-sm font-semibold text-body">
        Back to {record.residentDisplayName}
      </Link>
    </div>
  );

  if (!profile || !canCaptureResidentAssessment(profile.role)) {
    return message("You do not have permission to capture an assessment.");
  }

  const initialState = await getNativeCaptureStartState(id);
  if (initialState.kind === "error") return message(initialState.error);

  return <CaptureScreen residentId={id} residentDisplayName={record.residentDisplayName} initialState={initialState} />;
}
