import { computeInfectionResolutionEligibility } from "@/lib/compliance/infectionResolutionEligibility";
import { deriveInfectionOperationalState, type InfectionOperationalState } from "@/lib/compliance/infectionOperationalState";
import { formatPlainDate } from "@/lib/utils/date";
import { Badge } from "@/components/ui/Badge";
import { ResolveInfectionForm } from "./ResolveInfectionForm";
import { OPERATIONAL_STATE_LABELS, OPERATIONAL_STATE_TONES } from "./operationalStateLabels";
import { NEXT_FOLLOW_UP_PURPOSE_LABELS } from "./infectionFollowUpLabels";
import type {
  ComplianceCorrectiveAction,
  CorrectiveActionEffectivenessReview,
  Infection,
  InfectionFollowUp,
} from "@/lib/supabase/types";

// Same "border-ivory-border + tone-specific bg-*-surface" convention every
// other alert-style card in this app already uses (see
// components/compliance/AttentionCard.tsx, app/audit-readiness/drills/[id]/page.tsx)
// — never a tone-specific border color, which doesn't exist as a design
// token. 'resolved' is unused here (that branch returns early below) but
// listed for the Record's exhaustiveness.
const STATE_SURFACE_CLASS: Record<InfectionOperationalState, string> = {
  needs_review: "bg-warning-surface",
  follow_up_needed: "bg-overdue-surface",
  follow_up_due: "bg-warning-surface",
  follow_up_scheduled: "bg-blue-pale",
  corrective_action_incomplete: "bg-warning-surface",
  ready_to_resolve: "bg-gold-subtle",
  resolved: "bg-success-surface",
};

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

// Follow-Up & Resolution UX Refinement — this card no longer independently
// renders raw boolean conditions (the earlier version's literal
// "No outstanding follow-up scheduled" reading as a green success even
// when follow-up was required and never acted on). It now leads with a
// single state-driven banner built directly from
// lib/compliance/infectionOperationalState.ts's already-tested
// deriveInfectionOperationalState — the SAME function backing the register
// list's own status badge — so this card's meaning can never drift from
// what the rest of the app already calls this record's state. No new
// eligibility/state logic lives here; this file only decides how each
// existing state reads and looks. See
// components/incidents/IncidentResolutionCard.tsx for the structurally
// analogous (but Incident-specific) precedent this diverges from
// deliberately, per the Infection Lifecycle's own two-track model.
export function InfectionResolutionCard({
  infection,
  followUps,
  sourceLinkedActions,
  effectivenessReviewsByActionId,
  canResolve,
}: {
  infection: Infection;
  followUps: InfectionFollowUp[];
  sourceLinkedActions: ComplianceCorrectiveAction[];
  effectivenessReviewsByActionId: Map<string, CorrectiveActionEffectivenessReview>;
  canResolve: boolean;
}) {
  if (infection.status === "resolved") {
    return (
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolved By</dt>
          <dd className="mt-0.5 font-sans text-sm text-body">{infection.resolved_by}</dd>
        </div>
        <div>
          <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolved Date</dt>
          <dd className="mt-0.5 font-sans text-sm text-body">{infection.resolved_at}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-sans text-xs font-semibold uppercase tracking-wide text-subtle">Resolution Note</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-body">{infection.resolution_note}</dd>
        </div>
      </dl>
    );
  }

  const followUpEntryCount = followUps.length;
  const eligibility = computeInfectionResolutionEligibility(infection, followUpEntryCount, sourceLinkedActions);
  const state = deriveInfectionOperationalState(infection, followUpEntryCount, sourceLinkedActions);
  const mostRecentFollowUp = followUpEntryCount > 0 ? followUps[followUps.length - 1] : null;

  return (
    <div className="mt-3 space-y-4">
      <div className={`rounded-lg border border-ivory-border p-4 ${STATE_SURFACE_CLASS[state]}`}>
        <Badge tone={OPERATIONAL_STATE_TONES[state]}>{OPERATIONAL_STATE_LABELS[state]}</Badge>

        {state === "follow_up_needed" && (
          <>
            <p className="mt-2 font-sans text-sm text-body">
              Follow-up was required during review, but no infection follow-up has been recorded or scheduled.
            </p>
            <p className="mt-2 font-sans text-sm text-muted">
              <span className="font-medium text-body">Next step:</span> record a follow-up now, or schedule when the next
              follow-up should occur.
            </p>
          </>
        )}

        {(state === "follow_up_due" || state === "follow_up_scheduled") && infection.next_follow_up_date && (
          <>
            <p className="mt-2 font-sans text-sm text-body">
              Next follow-up: {formatPlainDate(infection.next_follow_up_date) ?? infection.next_follow_up_date}
              {infection.next_follow_up_purpose ? ` — ${NEXT_FOLLOW_UP_PURPOSE_LABELS[infection.next_follow_up_purpose]}` : ""}
            </p>
            {mostRecentFollowUp && (
              <p className="mt-1 font-sans text-xs text-subtle">
                Most recent follow-up recorded {formatPlainDate(mostRecentFollowUp.created_at) ?? mostRecentFollowUp.created_at}.
              </p>
            )}
            <p className="mt-2 font-sans text-sm text-muted">
              Resolution remains pending until the scheduled follow-up is completed and no additional follow-up is required.
            </p>
          </>
        )}

        {state === "corrective_action_incomplete" && (
          <>
            <p className="mt-2 font-sans text-sm text-body">
              {eligibility.blockers.some((b) => b.reason === "all_actions_cancelled")
                ? "Not ready to resolve — every Serve corrective action was cancelled without one being completed."
                : "Not ready to resolve — a Serve corrective action has not yet been completed."}
            </p>
            <ul className="mt-2 space-y-1">
              {sourceLinkedActions
                .filter((a) => a.lifecycle_stage !== "cancelled")
                .map((action) => {
                  const item = actionStatusLabel(action, effectivenessReviewsByActionId.get(action.id) ?? null);
                  return (
                    <li key={action.id} className="flex items-start gap-2 font-sans text-sm">
                      <span className={item.done ? "text-success-text" : "text-subtle"}>{item.done ? "✓" : "○"}</span>
                      <span className={item.done ? "text-body" : "text-muted"}>{item.label}</span>
                    </li>
                  );
                })}
            </ul>
          </>
        )}

        {state === "ready_to_resolve" && (
          <ul className="mt-2 space-y-1">
            <li className="flex items-start gap-2 font-sans text-sm">
              <span className="text-success-text">✓</span>
              <span className="text-body">Reviewed</span>
            </li>
            {infection.follow_up_required && (
              <>
                <li className="flex items-start gap-2 font-sans text-sm">
                  <span className="text-success-text">✓</span>
                  <span className="text-body">Required follow-up completed</span>
                </li>
                <li className="flex items-start gap-2 font-sans text-sm">
                  <span className="text-success-text">✓</span>
                  <span className="text-body">No additional follow-up outstanding</span>
                </li>
              </>
            )}
            {sourceLinkedActions.length > 0 && (
              <li className="flex items-start gap-2 font-sans text-sm">
                <span className="text-success-text">✓</span>
                <span className="text-body">Serve corrective action(s) complete</span>
              </li>
            )}
          </ul>
        )}

        {state === "needs_review" && (
          <p className="mt-2 font-sans text-sm text-body">Awaiting formal review — see Review &amp; Follow-up above.</p>
        )}
      </div>

      <div>
        {eligibility.eligible ? (
          canResolve ? (
            <ResolveInfectionForm infectionId={infection.id} />
          ) : (
            <p className="font-sans text-sm text-muted">Ready to resolve — awaiting resolution.</p>
          )
        ) : null}
      </div>
    </div>
  );
}
