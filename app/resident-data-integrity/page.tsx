import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canPerformReconciliationActions } from "@/lib/auth/permissions";
import { getIntegrityIssues, getIssueMemberResidentIds } from "@/lib/data/residentDataIntegrity";
import { getResidentsForComparison } from "@/lib/data/residentIdentity";
import { ResidentDataIntegrityQueue } from "@/components/residentDataIntegrity/ResidentDataIntegrityQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Security hotfix (fix/resident-identity-authorization) — this page and
// its detail route previously had NO server-side authorization check at
// all: any authenticated role, including office_staff, could view a
// cross-resident PII comparison queue merely by knowing the URL, and the
// mutating actions it links to (lib/actions/residentDataIntegrity.ts)
// checked only that a session existed, not the role. Gated here to the
// same canPerformReconciliationActions boundary /reconciliation already
// uses for its own actions (admin/manager/executive) — checked BEFORE any
// data fetch, so an unauthorized viewer never causes a single row of
// resident data to be read, not merely hidden behind a client-side
// control. Enforced again, independently, inside every exported action in
// lib/actions/residentDataIntegrity.ts — this page-level check is not the
// real authorization boundary, only the first one.
export default async function ResidentDataIntegrityPage() {
  const profile = await getCurrentAuthorizedUser();
  if (!canPerformReconciliationActions(profile?.role ?? null)) {
    return (
      <PageContainer title="Resident Data Integrity">
        <p className="font-sans text-sm text-muted">You do not have permission to view Resident Data Integrity.</p>
      </PageContainer>
    );
  }

  const issues = await getIntegrityIssues();

  const memberIdsByIssue = Object.fromEntries(
    await Promise.all(issues.map(async (i) => [i.id as string, await getIssueMemberResidentIds(i.id as string)] as const)),
  );

  const allResidentIds = [...new Set(Object.values(memberIdsByIssue).flat())];
  const residents = await getResidentsForComparison(allResidentIds);
  const residentsById = Object.fromEntries(residents.map((r) => [r.id, r]));

  return (
    <PageContainer title="Resident Data Integrity">
      <p className="mb-6 max-w-3xl font-sans text-body text-muted">
        Serve flags resident records that were parsed, normalized, or written incorrectly — the same import writing
        one person twice, a source row repeated before a resident was ever created, an invalid phone number, or a
        structural name defect. This is separate from{" "}
        <Link href="/resident-identities" className="underline">
          Resident Identities
        </Link>
        , which answers &quot;is this the same human?&quot; — these issues are about bad data handling, not identity
        uncertainty. Detection is automatic; nothing is ever changed without a review decision.
      </p>
      <ResidentDataIntegrityQueue issues={issues} memberIdsByIssue={memberIdsByIssue} residentsById={residentsById} />
    </PageContainer>
  );
}
