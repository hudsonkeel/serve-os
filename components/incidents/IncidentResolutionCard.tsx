import { computeIncidentResolutionEligibility } from "@/lib/compliance/incidentResolutionEligibility";
import { formatPlainDate } from "@/lib/utils/date";
import { ResolveIncidentForm } from "./ResolveIncidentForm";
import type { ComplianceCorrectiveAction, CorrectiveActionEffectivenessReview, Incident } from "@/lib/supabase/types";

function actionStatusLabel(
  action: ComplianceCorrectiveAction,
  review: CorrectiveActionEffectivenessReview | null
): { done: boolean; label: string } {
  if (action.lifecycle_stage === "cancelled") {
    return { done: true, label: `${action.title} — cancelled` };
  }

  if (action.effectiveness_review_required) {
    if (action.lifecycle_stage === "verified_effective") {
      return { done: true, label: `${action.title} — effectiveness verified` };
    }
    if (action.lifecycle_stage === "implemented") {
      if (review?.outcome && review.outcome !== "effective") {
        return { done: false, label: `${action.title} — effectiveness review recorded as ${review.outcome.replace("_", " ")}; additional action needed` };
      }
      const dueLabel = review ? (formatPlainDate(review.due_at) ?? review.due_at) : null;
      return { done: false, label: `${action.title} — effectiveness review${dueLabel ? ` due ${dueLabel}` : " pending"}` };
    }
    return { done: false, label: `${action.title} — awaiting implementation` };
  }

  const done =
    action.lifecycle_stage === "implemented" ||
    action.lifecycle_stage === "verified_effective" ||
    action.status === "resolved" ||
    action.status === "dismissed";
  return { done, label: done ? `${action.title} — implemented` : `${action.title} — awaiting implementation` };
}

// Incident Corrective Action Lifecycle v0.1 — never makes resolution
// available merely because review occurred. Renders exactly the
// checklist product asked for ("✓ Incident reviewed / ✓ Corrective action
// implemented / ○ Effectiveness review due Sep 24 / ○ Effectiveness
// verified"), driven by the same pure eligibility function
// (lib/compliance/incidentResolutionEligibility.ts) resolve_incident's own
// SQL guard mirrors — this card can never show "ready" when the RPC would
// actually reject the resolve call.
export function IncidentResolutionCard({
  incident,
  sourceLinkedActions,
  effectivenessReviewsByActionId,
  canResolve,
}: {
  incident: Incident;
  sourceLinkedActions: ComplianceCorrectiveAction[];
  effectivenessReviewsByActionId: Map<string, CorrectiveActionEffectivenessReview>;
  canResolve: boolean;
}) {
  if (incident.status === "resolved") {
    return (
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolved By</dt>
          <dd className="mt-0.5 font-sans text-sm text-body">{incident.resolved_by}</dd>
        </div>
        <div>
          <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolved Date</dt>
          <dd className="mt-0.5 font-sans text-sm text-body">{incident.resolved_at}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolution Note</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{incident.resolution_note}</dd>
        </div>
      </dl>
    );
  }

  const eligibility = computeIncidentResolutionEligibility(incident, sourceLinkedActions);

  const checklist: { done: boolean; label: string }[] = [{ done: incident.review_status === "reviewed", label: "Incident reviewed" }];

  if (incident.review_status === "reviewed" && incident.follow_up_required) {
    if (sourceLinkedActions.length === 0) {
      checklist.push({ done: false, label: "At least one corrective action required" });
    } else if (sourceLinkedActions.every((a) => a.lifecycle_stage === "cancelled")) {
      // Cancellation-gating decision — withdrawing every action is not
      // completion; this must read distinctly from "reviewed and eligible"
      // rather than silently showing an empty, all-satisfied-looking list.
      checklist.push({ done: false, label: "At least one corrective action must be completed — every action was cancelled" });
    } else {
      for (const action of sourceLinkedActions) {
        if (action.lifecycle_stage === "cancelled") continue;
        checklist.push(actionStatusLabel(action, effectivenessReviewsByActionId.get(action.id) ?? null));
      }
    }
  }

  return (
    <div className="mt-3">
      <ul className="space-y-1.5">
        {checklist.map((item, i) => (
          <li key={i} className="flex items-start gap-2 font-sans text-sm">
            <span className={item.done ? "text-success-text" : "text-subtle"}>{item.done ? "✓" : "○"}</span>
            <span className={item.done ? "text-body" : "text-muted"}>{item.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {eligibility.eligible ? (
          canResolve ? (
            <ResolveIncidentForm incidentId={incident.id} />
          ) : (
            <p className="font-sans text-sm text-muted">Ready to resolve — awaiting resolution.</p>
          )
        ) : (
          <p className="font-sans text-sm text-muted">Not yet ready to resolve — see conditions above.</p>
        )}
      </div>
    </div>
  );
}
