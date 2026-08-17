import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canRunAuditDrill } from "@/lib/compliance/permissions";
import { getAuditDrillScopeOptions } from "@/lib/compliance/auditDrillView";
import { StartAuditDrillForm } from "@/components/compliance/StartAuditDrillForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewAuditDrillPage() {
  const profile = await getCurrentAuthorizedUser();

  if (!canRunAuditDrill(profile?.role ?? null)) {
    return (
      <PageContainer title="Start Audit">
        <p className="font-sans text-sm text-muted">You do not have permission to start an audit.</p>
      </PageContainer>
    );
  }

  const scopeOptions = await getAuditDrillScopeOptions();
  const defaultAuditor = profile?.full_name || profile?.email || "";

  return (
    <PageContainer title="Start Audit">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-light text-body">Start Audit</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Only domains with seeded requirements and a real subject roster can be selected — an honest scope, not a
          promise of coverage that doesn&apos;t exist yet.
        </p>
      </div>

      <StartAuditDrillForm scopeOptions={scopeOptions} defaultAuditor={defaultAuditor} />
    </PageContainer>
  );
}
