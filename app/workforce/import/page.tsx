import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canAccessWorkforceDocuments } from "@/lib/workforce/permissions";
import { getWorkforceRoster } from "@/lib/workforce/roster";
import { BulkImportWizard } from "@/components/workforce/BulkImportWizard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkforceBulkImportPage() {
  const profile = await getCurrentAuthorizedUser();
  if (!canAccessWorkforceDocuments(profile?.role ?? null)) {
    notFound();
  }

  const roster = await getWorkforceRoster();

  return (
    <PageContainer title="Bulk Import Registry Evidence">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-light text-body">Bulk Import Registry Evidence</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Filename interpretation is a convenience only — every document requires human-confirmed caregiver and
          document type before it becomes an unverified evidence record.
        </p>
      </div>

      <BulkImportWizard
        roster={roster.map((r) => ({ workforceMemberId: r.workforceMemberId, displayName: r.displayName }))}
      />
    </PageContainer>
  );
}
