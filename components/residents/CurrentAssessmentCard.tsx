import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCentralTimestamp } from "@/lib/utils/date";
import type { CurrentAssessmentState } from "@/lib/assessmentIntelligence/currentAssessmentSelection";

function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// The Current Picture card's prominent assessment state — Assessment Workflow Slice B. Mirrors
// RecentSignal/NextRecommendedAction's "present only where real content exists" philosophy
// (CurrentPicture.tsx), but is intentionally the most prominent item in the card, full-width
// above them, since a Current Assessment (or the lack of one) is the single most operationally
// important fact about a person's record. Presentational only — every count and label is
// resolved by getCurrentAssessmentSummary()/selectCurrentAssessmentState() before this renders;
// this component makes no decision about which session is current.
export function CurrentAssessmentCard({ residentId, state }: { residentId: string; state: CurrentAssessmentState }) {
  if (state.kind === "none") return null;

  if (state.kind === "approved") {
    const approvedAtDisplay = formatCentralTimestamp(state.approvedAt) ?? state.approvedAt;
    return (
      <div className="rounded-lg border border-success-surface bg-success-surface/40 px-4 py-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-success-text">
            Current Assessment
          </h4>
        </div>
        <p className="font-sans text-sm text-body">
          Approved {approvedAtDisplay} by {state.approvedBy}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <LinkButton href={`/residents/${residentId}/assessment/${state.assessmentSessionId}`} size="small">
            View Assessment
          </LinkButton>
          {state.pdfDocumentId && (
            <Link
              href={`/residents/${residentId}/documents/${state.pdfDocumentId}`}
              className="font-sans text-xs font-semibold text-navy underline underline-offset-2"
            >
              Download PDF
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (state.kind === "needs_review") {
    const { session } = state;
    return (
      <div className="rounded-lg border border-warning-surface bg-warning-surface/40 px-4 py-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-warning-text">
            Assessment — Needs Review
          </h4>
        </div>
        <p className="font-sans text-sm text-body">{compactDate(session.assessmentDate)}</p>
        <p className="mt-1 font-sans text-xs text-subtle">
          {session.factsCapturedCount} facts captured · {session.openConflictsCount} conflicts ·{" "}
          {session.coverageQuestionsCount} coverage questions
        </p>
        <div className="mt-2">
          <LinkButton href={`/residents/${residentId}/assessment/${session.assessmentSessionId}`} size="small">
            Review Assessment →
          </LinkButton>
        </div>
      </div>
    );
  }

  // multiple_needs_review — deliberately never picks one for the operator; see
  // selectCurrentAssessmentState()'s own comment for why this ambiguity is surfaced rather than
  // silently resolved.
  return (
    <div className="rounded-lg border border-warning-surface bg-warning-surface/40 px-4 py-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="font-sans text-label font-semibold uppercase tracking-widest text-warning-text">
          Multiple Assessments Need Review
        </h4>
        <Badge tone="gold">{state.sessions.length}</Badge>
      </div>
      <p className="mb-2 font-sans text-xs text-subtle">
        More than one assessment is awaiting review for this person — resolve each before a Current Assessment can
        be established.
      </p>
      <ul className="space-y-2">
        {state.sessions.map((session) => (
          <li key={session.assessmentSessionId} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-sans text-sm text-body">{compactDate(session.assessmentDate)}</p>
              <p className="font-sans text-xs text-subtle">
                {session.factsCapturedCount} facts captured · {session.openConflictsCount} conflicts ·{" "}
                {session.coverageQuestionsCount} coverage questions
              </p>
            </div>
            <LinkButton href={`/residents/${residentId}/assessment/${session.assessmentSessionId}`} size="small">
              Review →
            </LinkButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
