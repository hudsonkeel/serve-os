import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canRunAuditDrill } from "@/lib/compliance/permissions";
import { getAuditSessionById, getAuditSessionItems } from "@/lib/data/auditSessions";
import { composeAuditSessionItemView, getAuditDrillScopeOptions, getRequirementsForSubject } from "@/lib/compliance/auditDrillView";
import { CorrectionModeEditor, type AddableOption, type OriginalItemForCorrection } from "@/components/compliance/CorrectionModeEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Correction Mode lives at its own route, matching this codebase's existing
// "route per multi-step review" convention
// (/residents/[id]/assessment/[sessionId] is the direct precedent) rather
// than an in-page mode toggle. Nothing here is persisted until the editor's
// final [Complete Correction & Lock] submit — leaving this page is simply
// abandoning an in-progress draft, no cleanup needed.
export default async function CorrectAuditDrillPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, getCurrentAuthorizedUser()]);

  if (!canRunAuditDrill(profile?.role ?? null)) {
    return (
      <PageContainer title="Correct Audit">
        <p className="font-sans text-sm text-muted">You do not have permission to correct an audit.</p>
      </PageContainer>
    );
  }

  const session = await getAuditSessionById(id);
  if (!session) notFound();
  if (session.status !== "completed") redirect(`/audit-readiness/drills/${id}`);

  const [rawItems, scopeOptions] = await Promise.all([getAuditSessionItems(id), getAuditDrillScopeOptions()]);
  const views = await Promise.all(rawItems.map(composeAuditSessionItemView));

  const originalItems: OriginalItemForCorrection[] = views
    .filter((v) => v.requirement !== null)
    .map((v) => ({
      auditSessionItemId: v.item.id,
      requirementId: v.item.requirement_id,
      requirementCode: v.requirement!.requirement_code,
      requirementName: v.requirement!.name,
      subjectType: v.item.subject_type,
      subjectId: v.item.subject_id,
      subjectLabel: v.subjectLabel,
      originalFinding: v.item.finding,
      originalNotes: v.item.notes,
    }));

  // Every requirement every in-scope subject could have a finding "added"
  // for — bounded (this session's own scope_domains × their subjects × 11
  // requirements each), small enough to hand the client component in full
  // rather than wiring a second client-triggered fetch.
  const inScope = scopeOptions.filter((o) => o.configured && session.scope_domains.includes(o.domainId));
  const addableOptionLists = await Promise.all(
    inScope.flatMap((domain) =>
      domain.subjects.map(async (s) => {
        const { requirements } = await getRequirementsForSubject("workforce_member", s.subjectId);
        return requirements.map(
          (r): AddableOption => ({
            subjectId: s.subjectId,
            subjectLabel: s.label,
            requirementId: r.requirement.id,
            requirementCode: r.requirement.requirement_code,
            requirementName: r.requirement.name,
          })
        );
      })
    )
  );
  const addableOptions = addableOptionLists.flat();

  return (
    <PageContainer title={`Correct — ${session.name}`}>
      <div className="mb-6">
        <Link href={`/audit-readiness/drills/${id}`} className="font-sans text-sm text-navy hover:text-navy-light">
          ← {session.name}
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-light text-body">Correct Audit</h1>
        <p className="mt-1 font-sans text-sm text-muted">
          Edit findings naturally, then review exactly what changed before locking one correction rationale in. The
          original completed audit stays exactly as recorded underneath — nothing here overwrites it.
        </p>
      </div>

      <CorrectionModeEditor sessionId={id} originalItems={originalItems} addableOptions={addableOptions} />
    </PageContainer>
  );
}
