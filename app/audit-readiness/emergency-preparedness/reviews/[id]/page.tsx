import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { getCurrentAuthorizedUser } from "@/lib/auth/session";
import { canRunAuditDrill, canViewAuditReadiness } from "@/lib/compliance/permissions";
import {
  getEmergencyPreparednessReviewById,
  getEmergencyPreparednessReviewItems,
} from "@/lib/data/emergencyPreparednessReviews";
import { getRequirementByCode } from "@/lib/data/personRequirements";
import {
  EP_ANNUAL_PLAN_REVIEW,
  EP_DISASTER_COORDINATOR_DESIGNATED,
  EP_PLAN_MAINTAINED,
  EP_RISK_ASSESSMENT_CURRENT,
} from "@/lib/emergencyPreparedness/constants";
import { RequirementFindingForm } from "@/components/emergencyPreparedness/RequirementFindingForm";
import { ImprovementForm } from "@/components/emergencyPreparedness/ImprovementForm";
import { CompleteReviewForm } from "@/components/emergencyPreparedness/CompleteReviewForm";
import { formatCentralDateTime } from "@/lib/utils/date";
import type { EmergencyPreparednessReviewOutcome, PersonRequirement } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The 4 requirements genuinely re-confirmed on the annual cycle —
// EP_ANNUAL_RESPONSE_DRILL is its own discrete event (recorded from the
// workspace, any time) and EP_HHS_NOTIFICATION is purely event-triggered —
// neither is walked here. See
// lib/emergencyPreparedness/emergencyPreparednessReviews.ts.
const WALKED_REQUIREMENT_CODES = [
  EP_PLAN_MAINTAINED,
  EP_DISASTER_COORDINATOR_DESIGNATED,
  EP_RISK_ASSESSMENT_CURRENT,
  EP_ANNUAL_PLAN_REVIEW,
];

const OUTCOME_LABELS: Record<EmergencyPreparednessReviewOutcome, string> = {
  no_change_needed: "Reviewed — No Change Needed",
  update_needed: "Reviewed — Updated",
  evidence_needed: "Evidence Needed",
  needs_review: "Needs Review",
};

const OUTCOME_TONES: Record<EmergencyPreparednessReviewOutcome, "success" | "blue" | "danger" | "warning"> = {
  no_change_needed: "success",
  update_needed: "blue",
  evidence_needed: "danger",
  needs_review: "warning",
};

export default async function EmergencyPreparednessReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile] = await Promise.all([params, getCurrentAuthorizedUser()]);

  if (!canViewAuditReadiness(profile?.role ?? null)) {
    return (
      <PageContainer title="Annual Review">
        <p className="font-sans text-sm text-muted">You do not have permission to view this review.</p>
      </PageContainer>
    );
  }

  const [review, items, requirements] = await Promise.all([
    getEmergencyPreparednessReviewById(id),
    getEmergencyPreparednessReviewItems(id),
    Promise.all(WALKED_REQUIREMENT_CODES.map((code) => getRequirementByCode(code))),
  ]);

  if (!review) notFound();

  const requirementList = requirements.filter((r): r is PersonRequirement => Boolean(r));
  const isCompleted = review.status === "completed";
  const canRun = !isCompleted && canRunAuditDrill(profile?.role ?? null);

  const findingItems = items.filter((i) => i.item_kind === "requirement_finding");
  const improvementItems = items.filter((i) => i.item_kind === "improvement");
  const itemByRequirementId = new Map(findingItems.map((i) => [i.requirement_id, i]));

  const summary = {
    findingCount: findingItems.length,
    improvementCount: improvementItems.length,
    noChangeCount: findingItems.filter((i) => i.outcome === "no_change_needed").length,
    updateCount: findingItems.filter((i) => i.outcome === "update_needed").length,
    evidenceNeededCount: findingItems.filter((i) => i.outcome === "evidence_needed").length,
    needsReviewCount: findingItems.filter((i) => i.outcome === "needs_review").length,
  };

  return (
    <PageContainer title="Annual Review">
      <div className="mb-6">
        <Link href="/audit-readiness/emergency-preparedness" className="font-sans text-sm text-navy hover:text-navy-light">
          ← Emergency Preparedness
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-3xl font-light text-body">Annual Review</h1>
            <p className="mt-1 font-sans text-sm text-muted">
              Reviewer: {review.reviewer} · Started {formatCentralDateTime(review.started_at)}
            </p>
          </div>
          <Badge tone={isCompleted ? "success" : "blue"}>{isCompleted ? "Completed" : "In Progress"}</Badge>
        </div>
        {isCompleted && review.summary && <p className="mt-3 font-sans text-sm text-body">{review.summary}</p>}
      </div>

      <section className="rounded-xl border border-ivory-border bg-white">
        <ul className="divide-y divide-ivory-border">
          {requirementList.map((requirement) => {
            const item = itemByRequirementId.get(requirement.id);
            return (
              <li key={requirement.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-medium text-body">{requirement.name}</p>
                    {requirement.regulatory_authority && (
                      <p className="mt-0.5 font-sans text-xs text-subtle">{requirement.regulatory_authority}</p>
                    )}
                    {item?.notes && <p className="mt-1 font-sans text-sm text-body">{item.notes}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {item?.outcome ? (
                      <Badge tone={OUTCOME_TONES[item.outcome]}>{OUTCOME_LABELS[item.outcome]}</Badge>
                    ) : (
                      <Badge tone="neutral">Not Yet Reviewed</Badge>
                    )}
                    {canRun && !item && (
                      <RequirementFindingForm reviewId={review.id} requirementCode={requirement.requirement_code} />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-ivory-border bg-white p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Improvements</h2>
        {improvementItems.length === 0 ? (
          <p className="mt-2 font-sans text-sm text-muted">No improvements suggested yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {improvementItems.map((i) => (
              <li key={i.id} className="font-sans text-sm text-body">
                {i.description}
                {i.notes && <span className="text-muted"> — {i.notes}</span>}
              </li>
            ))}
          </ul>
        )}
        {canRun && (
          <div className="mt-3">
            <ImprovementForm reviewId={review.id} />
          </div>
        )}
      </section>

      {canRun && (
        <section className="mt-6 rounded-xl border border-ivory-border bg-white p-5">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Complete Review</h2>
          <p className="mt-1 font-sans text-xs text-muted">
            Once completed, this review and every finding recorded in it become immutable.
          </p>
          <CompleteReviewForm reviewId={review.id} summary={summary} />
        </section>
      )}
    </PageContainer>
  );
}
