// Assessment Workflow Slice B — the Current Picture card's 3-state logic: is there a Current
// Assessment (approved), one assessment awaiting review, several (an ambiguity the operator must
// resolve, never silently collapsed), or nothing to show at all. Pure and deterministic over
// already-resolved inputs; the I/O composing this from CR_ASSESSMENT_CURRENT evidence and
// intake_assessment_sessions lives in lib/actions/assessmentIntelligence.ts's
// getCurrentAssessmentSummary().

/** A session's status genuinely awaiting reviewer action -- extraction has finished and there is
 * something for a human to look at, but no one has approved it yet. Deliberately excludes
 * 'recording'/'queued'/'processing'/'failed' (still being captured or not yet ready) and
 * 'approved'/'amended'/'operationalized' (already past this point) -- see intake_assessment_
 * sessions_status_check for the full status vocabulary this is a subset of. */
const REVIEW_READY_STATUSES = new Set(["draft", "needs_review"]);

export function isReviewReadyStatus(status: string): boolean {
  return REVIEW_READY_STATUSES.has(status);
}

export interface PendingAssessmentSummary {
  readonly assessmentSessionId: string;
  readonly assessmentDate: string;
  readonly factsCapturedCount: number;
  readonly openConflictsCount: number;
  readonly coverageQuestionsCount: number;
}

export interface ApprovedAssessmentSummary {
  readonly assessmentSessionId: string;
  readonly approvedAt: string;
  readonly approvedBy: string;
  /** Non-null only once automated PDF generation (Slice B item 8, deliberately deferred) has
   * successfully produced and stored a document -- always null until that slice exists. */
  readonly pdfDocumentId: string | null;
}

export type CurrentAssessmentState =
  | { readonly kind: "none" }
  | { readonly kind: "needs_review"; readonly session: PendingAssessmentSummary }
  | { readonly kind: "multiple_needs_review"; readonly sessions: readonly PendingAssessmentSummary[] }
  | ({ readonly kind: "approved" } & ApprovedAssessmentSummary);

/** A Current Assessment, once one exists, is always the headline state -- reassessment starting
 * a new draft/needs_review session doesn't demote it (that new session isn't real until it's
 * approved; see approveAssessment()'s own supersession-via-evidence handling). Ambiguity is only
 * a concern in the PRE-approval bucket: never silently pick one of several pending sessions to
 * link to -- surface the ambiguity and let the operator resolve it. */
export function selectCurrentAssessmentState(input: {
  readonly approved: ApprovedAssessmentSummary | null;
  readonly pendingSessions: readonly PendingAssessmentSummary[];
}): CurrentAssessmentState {
  if (input.approved) return { kind: "approved", ...input.approved };
  if (input.pendingSessions.length === 0) return { kind: "none" };
  if (input.pendingSessions.length === 1) return { kind: "needs_review", session: input.pendingSessions[0] };
  return { kind: "multiple_needs_review", sessions: input.pendingSessions };
}
