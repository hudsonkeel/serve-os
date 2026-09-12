"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { recordEffectivenessReviewOutcomeAction } from "@/lib/actions/correctiveActions";
import { formatPlainDate, formatCentralDateTime, isBusinessDateDueTodayOrEarlier } from "@/lib/utils/date";
import type { CorrectiveActionEffectivenessReview, EffectivenessReviewOutcome } from "@/lib/supabase/types";

const OUTCOME_LABELS: Record<EffectivenessReviewOutcome, string> = {
  effective: "Effective",
  partially_effective: "Partially Effective",
  ineffective: "Ineffective",
};

const OUTCOME_TONES: Record<EffectivenessReviewOutcome, "success" | "warning" | "danger"> = {
  effective: "success",
  partially_effective: "warning",
  ineffective: "danger",
};

// Incident Corrective Action Lifecycle v0.1 — Effective/Verified is
// reachable only from here (record_effectiveness_review_outcome), and only
// via a completed, evidence-backed outcome — the generic Resolve/Dismiss
// affordance elsewhere on the action card can never substitute for it (see
// resolve_compliance_corrective_action's own DB guard). Partially
// Effective/Ineffective keeps the action (and incident) open and surfaces
// the "Add Additional Action" path rather than allowing a retry of this
// same review record. Domain-agnostic — corrective_action_effectiveness_reviews
// isn't incident-specific, so this lives in components/compliance/ for any
// QAPI domain to reuse once it has its own creation path into that table.
export function EffectivenessReviewSection({
  review,
  canRecordOutcome,
  onRequestAdditionalAction,
}: {
  review: CorrectiveActionEffectivenessReview;
  canRecordOutcome: boolean;
  // Omitted (rather than passed as a no-op) when the viewer cannot create
  // corrective actions — the link itself should not appear for a viewer
  // who could click it and get nothing.
  onRequestAdditionalAction?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<EffectivenessReviewOutcome | null>(null);
  const [evidence, setEvidence] = useState("");

  // Live-validation fix — a defense-in-depth mirror of
  // record_effectiveness_review_outcome's own due-date guard: the outcome
  // form itself must not even be offered before the review is actually
  // due, not just rejected server-side after the fact. Same business-date
  // comparison Today's Work uses (never a UTC instant for a `date` column)
  // — due today counts as reached, matching the RPC's own "not yet due"
  // (strictly future) vs. "due" boundary. No early-review override exists
  // for v0.1: this is a hide, not a disabled-with-tooltip affordance.
  const dueDateReached = isBusinessDateDueTodayOrEarlier(review.due_at);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!outcome) {
      setError("Please select an outcome.");
      return;
    }
    if (!evidence.trim()) {
      setError("Evidence / findings are required.");
      return;
    }

    startTransition(async () => {
      const res = await recordEffectivenessReviewOutcomeAction({ reviewId: review.id, outcome, evidence: evidence.trim() });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-ivory-border bg-ivory-warm p-3">
      <p className="font-sans text-label font-semibold uppercase tracking-widest text-subtle">Effectiveness Review</p>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <div>
          <dt className="font-sans text-[11px] font-medium text-muted">Due</dt>
          <dd className="font-sans text-sm text-body">{formatPlainDate(review.due_at) ?? review.due_at}</dd>
        </div>
        <div>
          <dt className="font-sans text-[11px] font-medium text-muted">Owner</dt>
          <dd className="font-sans text-sm text-body">{review.owner || "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-sans text-[11px] font-medium text-muted">Success Criteria / Expected Evidence</dt>
          <dd className="whitespace-pre-wrap font-sans text-sm text-body">{review.success_criteria}</dd>
        </div>
      </dl>

      {/* Void-and-reopen correction mechanism — a read-only, permanent
          record of an erroneously-recorded determination. Shown whenever
          voided_at is set, independently of the active outcome fields
          below (which are nulled back to pending at the same moment the
          void happens, so the review can carry both "here's what was
          wrongly recorded before" and "here's its current, real status"
          at once). Never editable, never removable. */}
      {review.voided_at && (
        <div className="mt-3 rounded-lg border border-dashed border-ivory-border bg-ivory p-3">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-wide text-subtle">
            Previously Recorded Effectiveness Outcome — Voided
          </p>
          <div className="mt-1.5 space-y-1.5">
            <Badge tone={review.voided_outcome ? OUTCOME_TONES[review.voided_outcome] : "neutral"}>
              {review.voided_outcome ? OUTCOME_LABELS[review.voided_outcome] : "—"}
            </Badge>
            <div>
              <p className="font-sans text-[11px] font-medium text-muted">Evidence / Findings</p>
              <p className="whitespace-pre-wrap font-sans text-sm text-body">{review.voided_evidence}</p>
            </div>
            <p className="font-sans text-xs text-subtle">
              {review.voided_reviewed_by} · {review.voided_reviewed_at ? formatCentralDateTime(review.voided_reviewed_at) : "—"}
            </p>
            <div className="border-t border-ivory-border pt-1.5">
              <p className="font-sans text-[11px] font-medium text-muted">Void Reason</p>
              <p className="whitespace-pre-wrap font-sans text-sm text-body">{review.void_reason}</p>
              <p className="mt-0.5 font-sans text-xs text-subtle">
                Voided by {review.voided_by} · {review.voided_at ? formatCentralDateTime(review.voided_at) : "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      {review.outcome ? (
        <div className="mt-3 space-y-1.5 border-t border-ivory-border pt-3">
          <Badge tone={OUTCOME_TONES[review.outcome]}>{OUTCOME_LABELS[review.outcome]}</Badge>
          <div>
            <p className="font-sans text-[11px] font-medium text-muted">Evidence / Findings</p>
            <p className="whitespace-pre-wrap font-sans text-sm text-body">{review.evidence}</p>
          </div>
          <p className="font-sans text-xs text-subtle">
            {review.reviewed_by} · {review.reviewed_at ? formatCentralDateTime(review.reviewed_at) : "—"}
          </p>

          {review.outcome !== "effective" && onRequestAdditionalAction && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onRequestAdditionalAction}
                className="font-sans text-xs font-medium text-navy hover:text-navy-light"
              >
                + Add Additional Action
              </button>
            </div>
          )}
        </div>
      ) : canRecordOutcome && dueDateReached ? (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-ivory-border pt-3">
          <div>
            <span className="mb-1 block font-sans text-[11px] font-medium text-muted">Outcome</span>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(OUTCOME_LABELS) as EffectivenessReviewOutcome[]).map((value) => (
                <label key={value} className="flex items-center gap-1.5 font-sans text-sm text-body">
                  <input type="radio" name={`outcome-${review.id}`} checked={outcome === value} onChange={() => setOutcome(value)} />
                  {OUTCOME_LABELS[value]}
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block font-sans text-[11px] font-medium text-muted">Evidence / Findings</span>
            <AutoGrowTextarea value={evidence} onChange={(e) => setEvidence(e.target.value)} minRows={2} />
          </label>
          {error && <p className="font-sans text-xs text-red-600">{error}</p>}
          <Button type="submit" size="small" variant="primary" disabled={isPending}>
            {isPending ? "Saving…" : "Record Outcome"}
          </Button>
        </form>
      ) : !dueDateReached ? (
        <p className="mt-3 border-t border-ivory-border pt-3 font-sans text-xs text-muted">
          Not yet due — the effectiveness outcome can be recorded starting {formatPlainDate(review.due_at) ?? review.due_at}.
        </p>
      ) : (
        <p className="mt-3 border-t border-ivory-border pt-3 font-sans text-xs text-muted">Awaiting effectiveness review outcome.</p>
      )}
    </div>
  );
}
