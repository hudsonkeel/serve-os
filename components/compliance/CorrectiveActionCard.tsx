"use client";

import { Badge } from "@/components/ui/Badge";
import { ResolveCorrectiveActionButton } from "@/components/compliance/ResolveCorrectiveActionButton";
import { CorrectiveActionUpdatesTimeline } from "./CorrectiveActionUpdatesTimeline";
import { EffectivenessReviewSection } from "./EffectivenessReviewSection";
import { MarkCorrectiveActionImplementedButton } from "./MarkCorrectiveActionImplementedButton";
import { CancelCorrectiveActionButton } from "./CancelCorrectiveActionButton";
import { LIFECYCLE_STAGE_LABELS, LIFECYCLE_STAGE_TONES } from "./correctiveActionLabels";
import { formatPlainDate } from "@/lib/utils/date";
import type { ComplianceCorrectiveAction, CorrectiveActionEffectivenessReview, CorrectiveActionUpdate } from "@/lib/supabase/types";

const PRIORITY_TONES: Record<ComplianceCorrectiveAction["priority"], "neutral" | "gold" | "warning" | "danger"> = {
  low: "neutral",
  normal: "neutral",
  high: "gold",
  urgent: "danger",
};

// Incident Corrective Action Lifecycle v0.1 — a single corrective action,
// rendered as a readable card once created (never permanently as an edit
// form, per the "progressive disclosure" requirement). One incident can
// have several of these, each independently progressing through its own
// lifecycle_stage. Domain-agnostic (driven entirely by ComplianceCorrectiveAction
// / CorrectiveActionEffectivenessReview / CorrectiveActionUpdate — none of
// which are incident-specific) — lives in components/compliance/ so any
// QAPI domain sourcing rows into these shared tables (Infection Lifecycle
// v0.1 and beyond) reuses it unchanged. The caller still owns anything
// domain-specific: which "create" form to show, and what "Add Additional
// Action" should do (via onRequestAdditionalAction).
export function CorrectiveActionCard({
  action,
  effectivenessReview,
  updates,
  canManage,
  onRequestAdditionalAction,
}: {
  action: ComplianceCorrectiveAction;
  effectivenessReview: CorrectiveActionEffectivenessReview | null;
  updates: CorrectiveActionUpdate[];
  canManage: boolean;
  onRequestAdditionalAction: () => void;
}) {
  return (
    <div className="rounded-xl border border-ivory-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-sm font-semibold text-body">{action.title}</p>
          <p className="mt-0.5 font-sans text-xs text-subtle">
            {action.owner ? `Owner: ${action.owner}` : "No owner assigned"}
            {action.due_at ? ` · Due ${formatPlainDate(action.due_at) ?? action.due_at}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={PRIORITY_TONES[action.priority]}>{action.priority}</Badge>
          <Badge tone={LIFECYCLE_STAGE_TONES[action.lifecycle_stage]}>{LIFECYCLE_STAGE_LABELS[action.lifecycle_stage]}</Badge>
          {action.status !== "open" && <Badge tone="neutral">{action.status === "resolved" ? "Resolved" : "Dismissed"}</Badge>}
        </div>
      </div>

      <dl className="mt-3 space-y-2">
        <div>
          <dt className="font-sans text-[11px] font-medium uppercase tracking-wide text-subtle">Finding / Reason</dt>
          <dd className="whitespace-pre-wrap font-sans text-sm text-body">{action.reason}</dd>
        </div>
        {action.action_plan && (
          <div>
            <dt className="font-sans text-[11px] font-medium uppercase tracking-wide text-subtle">Action to Be Taken</dt>
            <dd className="whitespace-pre-wrap font-sans text-sm text-body">{action.action_plan}</dd>
          </div>
        )}
      </dl>

      {action.lifecycle_stage === "cancelled" && (
        <div className="mt-3 rounded-lg border border-ivory-border bg-ivory p-3">
          <p className="font-sans text-[11px] font-medium uppercase tracking-wide text-subtle">Cancellation Reason</p>
          <p className="whitespace-pre-wrap font-sans text-sm text-body">{action.cancellation_note}</p>
          <p className="mt-1 font-sans text-xs text-subtle">
            {action.cancelled_by} · {action.cancelled_at ? formatPlainDate(action.cancelled_at) ?? action.cancelled_at : ""}
          </p>
        </div>
      )}

      {canManage && action.lifecycle_stage === "open" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <MarkCorrectiveActionImplementedButton actionId={action.id} />
          <CancelCorrectiveActionButton actionId={action.id} />
        </div>
      )}
      {canManage && action.lifecycle_stage === "implemented" && !action.effectiveness_review_required && (
        <div className="mt-3 flex flex-wrap gap-2">
          <CancelCorrectiveActionButton actionId={action.id} />
        </div>
      )}

      {effectivenessReview && (
        <EffectivenessReviewSection
          review={effectivenessReview}
          canRecordOutcome={canManage && action.lifecycle_stage === "implemented"}
          onRequestAdditionalAction={canManage ? onRequestAdditionalAction : undefined}
        />
      )}

      {canManage && action.status === "open" && (action.lifecycle_stage === "verified_effective" || action.lifecycle_stage === "cancelled" || (action.lifecycle_stage === "implemented" && !action.effectiveness_review_required)) && (
        <div className="mt-3">
          <ResolveCorrectiveActionButton actionId={action.id} actionTitle={action.title} />
        </div>
      )}

      <CorrectiveActionUpdatesTimeline correctiveActionId={action.id} updates={updates} canAddUpdate={canManage} />
    </div>
  );
}
