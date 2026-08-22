import { redirect } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { resolveCurrentCommunity } from "@/lib/auth/currentCommunity";
import { RosterUploadForm } from "@/components/residentRoster/RosterUploadForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Section 6/56: an "All Communities" context never pre-selects a
// community — the operator must explicitly choose one. A single-
// community context pre-fills it (section 108), still changeable before
// upload.
export default async function NewRosterImportPage() {
  const profile = await getCurrentAuthorizedUser();
  if (!profile || !canPerformReconciliationActions(profile.role)) {
    redirect("/residents/roster-import");
  }

  const context = await resolveCurrentCommunity(profile);
  const communities = (context?.communities ?? []).filter((c) => c.is_active);
  const preselectedCommunityId = context?.scope.mode === "single_community" ? context.scope.communityId : null;

  return (
    <PageContainer title="The People We Serve · Import a Community Roster">
      <div className="mb-6">
        <h1 className="font-serif text-page-title font-light text-body">Import a Community Roster</h1>
        <p className="mt-1 font-sans text-base text-muted">
          Select the community this roster belongs to, then upload the file. Nothing is created or linked yet — the
          next step lets you review what Serve found before anything changes.
        </p>
      </div>

      <RosterUploadForm communities={communities} preselectedCommunityId={preselectedCommunityId} />
    </PageContainer>
  );
}
