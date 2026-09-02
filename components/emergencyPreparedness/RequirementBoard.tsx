"use client";

import { useEffect, useRef, useState } from "react";
import { RequirementStatusCard, resolveStatusCardCta } from "@/components/compliance/AttentionCard";
import { EvidenceViewButton } from "@/components/compliance/EvidenceViewButton";
import { ResolveCorrectiveActionButton } from "@/components/compliance/ResolveCorrectiveActionButton";
import { EvidenceUpdateForm } from "@/components/emergencyPreparedness/EvidenceUpdateForm";
import { DrillOrResponseForm } from "@/components/emergencyPreparedness/DrillOrResponseForm";
import { OperationalEventForm } from "@/components/emergencyPreparedness/OperationalEventForm";
import {
  EP_ANNUAL_PLAN_REVIEW,
  EP_ANNUAL_RESPONSE_DRILL,
  EP_DISASTER_COORDINATOR_DESIGNATED,
  EP_HHS_NOTIFICATION,
} from "@/lib/emergencyPreparedness/constants";
import type { AuditReadinessStatus } from "@/lib/compliance/auditReadinessStatus";
import type { ComplianceCorrectiveAction } from "@/lib/supabase/types";

export interface RequirementBoardItem {
  requirementCode: string;
  requirementName: string;
  regulatoryAuthority: string | null;
  status: AuditReadinessStatus;
  explanation: string;
  evidenceSummary: string | null;
  evidenceDocumentId: string | null;
  // Today's Work Actionability slice — an open compliance_corrective_actions
  // row tied to this requirement (via requirement_id), if one exists. When
  // present, this is what a corrective_action WorkItem's ?requirement=CODE
  // deep link is actually meant to resolve — surfaced here so that landing
  // on this page from Today's Work reaches a real resolve affordance, not
  // just the requirement's own evidence-based status.
  openCorrectiveAction: ComplianceCorrectiveAction | null;
}

// The requirement-specific remediation experience each card's CTA opens
// into — the card only identifies state; this performs the work. One
// action per requirement, chosen for what's actually wired for it (never a
// button that doesn't do anything real):
//   - EP_ANNUAL_PLAN_REVIEW's own satisfying fact IS a completed review —
//     its action is Start/Resume Annual Review, not a direct evidence form.
//   - EP_ANNUAL_RESPONSE_DRILL is its own discrete event — Record/Verify
//     Drill or Actual Response.
//   - EP_HHS_NOTIFICATION is not_applicable until a real triggering event
//     exists — its action records that event; once applicable, it takes
//     direct evidence like any other requirement.
//   - Everything else (EP_PLAN_MAINTAINED, EP_DISASTER_COORDINATOR_DESIGNATED,
//     EP_RISK_ASSESSMENT_CURRENT) takes a direct, review-independent
//     evidence record — the Annual Review is where these get reaffirmed
//     once a year, but establishing/replacing evidence isn't gated behind
//     a review session.
// Today's Work Actionability slice — an open corrective Action's resolve
// affordance renders ABOVE whatever the requirement's own evidence action
// is, never in place of it: the two are separate obligations (an Annual
// Review flagged a follow-up; the requirement itself may still separately
// need current evidence), and both can be true for the same requirement at
// once.
function OpenCorrectiveActionNotice({ action, canManage }: { action: ComplianceCorrectiveAction; canManage: boolean }) {
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-warning-surface p-3">
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-warning-text">Open Corrective Action</p>
      <p className="mt-1 font-sans text-sm text-body">
        {action.title}
        {action.due_at ? ` — due ${new Date(action.due_at).toLocaleDateString()}` : ""}
      </p>
      {canManage ? (
        <div className="mt-2">
          <ResolveCorrectiveActionButton actionId={action.id} actionTitle={action.title} />
        </div>
      ) : (
        <p className="mt-1 font-sans text-xs text-muted">Your role does not include corrective-action resolution.</p>
      )}
    </div>
  );
}

function RequirementActions({
  item,
  canRun,
  canManage,
  inProgressReviewHref,
}: {
  item: RequirementBoardItem;
  canRun: boolean;
  canManage: boolean;
  inProgressReviewHref: string | null;
}) {
  if (item.requirementCode === EP_ANNUAL_PLAN_REVIEW) {
    if (!canRun) return null;
    // Deliberately no button here — Start/Resume Annual Review is a
    // page-level (not per-requirement) action and already has one
    // authoritative entry point in the page header. Duplicating that exact
    // button inside this card would present the same action twice; this
    // panel only explains what resolves it and points to where.
    return (
      <p className="font-sans text-xs text-muted">
        Confirmed as part of the Annual Review — use {inProgressReviewHref ? "Resume Annual Review" : "Start Annual Review"} above.
      </p>
    );
  }

  if (item.requirementCode === EP_ANNUAL_RESPONSE_DRILL) {
    return canRun ? <DrillOrResponseForm /> : null;
  }

  if (item.requirementCode === EP_HHS_NOTIFICATION) {
    if (item.status === "not_applicable") {
      return canManage ? <OperationalEventForm /> : null;
    }
    return canManage ? <EvidenceUpdateForm requirementCode={item.requirementCode} label="Upload Evidence" /> : null;
  }

  if (!canManage) return null;
  const label = item.requirementCode === EP_DISASTER_COORDINATOR_DESIGNATED ? "Record/Verify Designation" : "Upload Evidence";
  return <EvidenceUpdateForm requirementCode={item.requirementCode} label={label} />;
}

export function RequirementBoard({
  items,
  canRun,
  canManage,
  canViewDocuments,
  inProgressReviewHref,
  initialSelectedCode,
}: {
  items: RequirementBoardItem[];
  canRun: boolean;
  canManage: boolean;
  canViewDocuments: boolean;
  inProgressReviewHref: string | null;
  initialSelectedCode?: string;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(initialSelectedCode ?? null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialSelectedCode) panelRef.current?.scrollIntoView({ block: "center" });
    // Only ever run on mount for the card this page landed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = items.find((i) => i.requirementCode === selectedCode) ?? null;

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <RequirementStatusCard
            key={item.requirementCode}
            name={item.requirementName}
            status={item.status}
            explanation={item.explanation}
            ctaLabel={resolveStatusCardCta(item.status)}
            isSelected={selectedCode === item.requirementCode}
            onClick={() => setSelectedCode((c) => (c === item.requirementCode ? null : item.requirementCode))}
          />
        ))}
      </div>

      {selected && (
        <div ref={panelRef} className="mt-4 rounded-xl border border-navy/20 bg-ivory-warm p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-sans text-sm font-semibold text-body">{selected.requirementName}</p>
              {selected.regulatoryAuthority && (
                <p className="mt-0.5 font-sans text-xs text-subtle">{selected.regulatoryAuthority}</p>
              )}
              <p className="mt-1 font-sans text-sm text-body">{selected.explanation}</p>
              {selected.evidenceSummary && <p className="mt-1 font-sans text-xs text-muted">{selected.evidenceSummary}</p>}
              {selected.evidenceDocumentId && canViewDocuments && (
                <div className="mt-1">
                  <EvidenceViewButton documentId={selected.evidenceDocumentId} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedCode(null)}
              className="shrink-0 font-sans text-xs text-muted hover:text-body"
            >
              Close ✕
            </button>
          </div>

          <div className="mt-4 border-t border-ivory-border pt-4">
            {selected.openCorrectiveAction && (
              <OpenCorrectiveActionNotice action={selected.openCorrectiveAction} canManage={canManage} />
            )}
            <RequirementActions item={selected} canRun={canRun} canManage={canManage} inProgressReviewHref={inProgressReviewHref} />
          </div>
        </div>
      )}
    </div>
  );
}
