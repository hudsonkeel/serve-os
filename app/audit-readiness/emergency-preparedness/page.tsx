import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canManageCorrectiveActions, canRunAuditDrill, canViewAuditReadiness } from "@/lib/compliance/permissions";
import { canAccessWorkforceDocuments } from "@/lib/workforce/permissions";
import { getEmergencyPreparednessReadinessEvaluation } from "@/lib/emergencyPreparedness/emergencyPreparednessReadiness";
import { EP_PLAN_MAINTAINED } from "@/lib/emergencyPreparedness/constants";
import { listEmergencyPreparednessReviews } from "@/lib/data/emergencyPreparednessReviews";
import { getComplianceActivityForSubject } from "@/lib/data/complianceActivity";
import { EvidenceViewButton } from "@/components/compliance/EvidenceViewButton";
import { StartReviewButton } from "@/components/emergencyPreparedness/StartReviewButton";
import { RequirementBoard, type RequirementBoardItem } from "@/components/emergencyPreparedness/RequirementBoard";
import { formatCentralDateTime } from "@/lib/utils/date";
import type { PersonEvidence } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// A short, plain-language evidence summary for a requirement's detail
// panel — not a full history (that's "What Happened Historically" /
// evidence supersession chain), just enough to answer "is there anything
// on file, and what does it say" at a glance.
function evidenceSummary(evidence: PersonEvidence | null): string | null {
  if (!evidence) return null;
  const parts = [`Recorded ${new Date(evidence.created_at).toLocaleDateString()}`];
  parts.push(evidence.verification_status === "verified" ? "verified" : evidence.verification_status.replace(/_/g, " "));
  if (evidence.expiration_date) parts.push(`expires ${new Date(evidence.expiration_date).toLocaleDateString()}`);
  return parts.join(" — ");
}

export default async function EmergencyPreparednessPage({
  searchParams,
}: {
  searchParams: Promise<{ requirement?: string }>;
}) {
  const [profile, { requirement: selectedRequirementCode }] = await Promise.all([getCurrentAuthorizedUser(), searchParams]);

  if (!canViewAuditReadiness(profile?.role ?? null)) {
    return (
      <PageContainer title="Emergency Preparedness">
        <p className="font-sans text-sm text-muted">You do not have permission to view Emergency Preparedness.</p>
      </PageContainer>
    );
  }

  const evaluation = await getEmergencyPreparednessReadinessEvaluation();

  if (!evaluation) {
    return (
      <PageContainer title="Emergency Preparedness">
        <p className="font-sans text-sm text-muted">
          Emergency Preparedness is not yet configured — no agency record or requirement set found.
        </p>
      </PageContainer>
    );
  }

  const [reviews, operationalEvents] = await Promise.all([
    listEmergencyPreparednessReviews(),
    getComplianceActivityForSubject("agency", evaluation.agency.id),
  ]);

  const canViewDocuments = canAccessWorkforceDocuments(profile?.role ?? null);
  const canRun = canRunAuditDrill(profile?.role ?? null);
  const canManage = canManageCorrectiveActions(profile?.role ?? null);
  const inProgressReview = reviews.find((r) => r.status === "in_progress") ?? null;
  const inProgressReviewHref = inProgressReview
    ? `/audit-readiness/emergency-preparedness/reviews/${inProgressReview.id}`
    : null;

  const planEvidence = evaluation.requirements.find((r) => r.requirement.requirement_code === EP_PLAN_MAINTAINED);
  const applicable = evaluation.requirements.filter((r) => r.status !== "not_applicable");
  const satisfiedCount = applicable.filter(
    (r) => r.status === "compliant" || r.status === "satisfied_by_event" || r.status === "exception"
  ).length;

  const boardItems: RequirementBoardItem[] = evaluation.requirements.map((r) => ({
    requirementCode: r.requirement.requirement_code,
    requirementName: r.requirement.name,
    regulatoryAuthority: r.requirement.regulatory_authority,
    status: r.status,
    explanation: r.explanation,
    evidenceSummary: evidenceSummary(r.latestEvidence),
    evidenceDocumentId: r.latestEvidence?.document_id ?? null,
  }));

  return (
    <PageContainer title="Emergency Preparedness">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <Link href="/audit-readiness" className="font-sans text-sm text-navy hover:text-navy-light">
            ← Audit Readiness
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-light text-body">Emergency Preparedness</h1>
          <p className="mt-1 font-sans text-sm text-muted">
            Serve&apos;s Emergency Preparedness and Response Plan (EPRP) readiness, per P&amp;P §256.
          </p>
        </div>
        {canRun && !inProgressReview && <StartReviewButton />}
        {canRun && inProgressReviewHref && (
          <Link
            href={inProgressReviewHref}
            className="rounded-lg bg-navy px-4 py-2 font-sans text-sm font-medium text-white hover:bg-navy-light"
          >
            Resume Annual Review
          </Link>
        )}
      </div>

      {/* ─── What governs us ─── */}
      <section className="mb-6 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">What Governs Us</h2>
        {planEvidence?.latestEvidence ? (
          <p className="mt-2 font-sans text-sm text-body">
            Current EPRP on file — effective {new Date(planEvidence.latestEvidence.effective_date ?? planEvidence.latestEvidence.created_at).toLocaleDateString()}
            {canViewDocuments && planEvidence.latestEvidence.document_id && (
              <>
                {" · "}
                <EvidenceViewButton documentId={planEvidence.latestEvidence.document_id} />
              </>
            )}
          </p>
        ) : (
          <p className="mt-2 font-sans text-sm text-danger-text">No EPRP document currently on file.</p>
        )}
        <p className="mt-3 font-sans text-xs text-muted">
          {evaluation.requirements.length} requirements govern Emergency Preparedness readiness, per Serve P&amp;P §256.
        </p>
      </section>

      {/* ─── Where do we stand — same compact status-card grammar as the
          main Audit Readiness dashboard's Needs Attention cards. Selecting
          a card reveals its evidence, explanation, and the specific action
          that resolves or views it — the card itself never carries every
          possible action. ─── */}
      <section className="mb-6 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Where Do We Stand</h2>
        <p className="mt-2 font-sans text-sm text-body">
          <span className="font-semibold text-success-text">{satisfiedCount}</span> of {applicable.length} applicable
          requirements satisfied
        </p>

        <div className="mt-4">
          <RequirementBoard
            items={boardItems}
            canRun={canRun}
            canManage={canManage}
            canViewDocuments={canViewDocuments}
            inProgressReviewHref={inProgressReviewHref}
            initialSelectedCode={selectedRequirementCode}
          />
        </div>
      </section>

      {/* ─── What happened historically ─── */}
      <section className="rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">What Happened Historically</h2>

        <p className="mt-3 font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Annual Reviews</p>
        {reviews.length === 0 ? (
          <p className="mt-1 font-sans text-sm text-muted">No Annual Review has been recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/audit-readiness/emergency-preparedness/reviews/${r.id}`}
                  className="font-sans text-sm text-navy hover:text-navy-light"
                >
                  {r.status === "completed" ? "Completed" : "In Progress"} — {r.reviewer},{" "}
                  {formatCentralDateTime(r.completed_at ?? r.started_at)}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Recorded Operational Events</p>
        {operationalEvents.length === 0 ? (
          <p className="mt-1 font-sans text-sm text-muted">No temporary relocation or service-area expansion recorded.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {operationalEvents.map((e) => (
              <li key={e.id} className="font-sans text-sm text-body">
                {e.event_title} — {formatCentralDateTime(e.created_at)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
