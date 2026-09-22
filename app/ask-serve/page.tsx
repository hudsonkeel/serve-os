import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canViewAskServe } from "@/lib/navigation/permissions";
import { AskServeWorkspace } from "@/components/askServe/AskServeWorkspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AskServePage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canViewAskServe(profile?.role ?? null)) {
    return (
      <PageContainer title="Ask Serve">
        <p className="font-sans text-sm text-muted">You do not have permission to view Ask Serve.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Ask Serve">
      <AskServeWorkspace />
    </PageContainer>
  );
}
