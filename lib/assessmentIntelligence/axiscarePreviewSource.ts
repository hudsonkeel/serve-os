// Which ONE approved assessment an AxisCare projection may be built from (pure; no I/O).
//
// Authority: the canonical "current assessment" is the most recent non-superseded
// CR_ASSESSMENT_CURRENT evidence row (lib/compliance/requirementSetStatus.ts
// mostRecentEvidenceForRequirement → getCurrentAssessmentSummary / selectCurrentAssessmentState),
// whose external_reference is the approved assessment session. This module does NOT redefine
// "current": the caller passes that canonical latest row. It only REFUSES when the canonical record
// set is inconsistent (more than one non-superseded row naming different sessions), when the
// requested session isn't approved, or when it isn't the current one — an AxisCare projection is
// never built from a historical or merged set of approved facts.

export const APPROVED_SESSION_STATUSES: readonly string[] = ["approved", "amended", "operationalized"];

export interface CurrentAssessmentEvidenceRow {
  /** person_evidence.external_reference — the approved assessment session id (may be null). */
  sessionId: string | null;
  createdAt: string;
}

export interface SessionRef {
  id: string;
  residentId: string;
  status: string;
}

export type AxisCarePreviewSourceBlocker =
  | "session_not_found"
  | "requested_not_approved"
  | "no_current_assessment"
  | "ambiguous_current_assessment"
  | "current_assessment_inconsistent"
  | "requested_not_current";

export type AxisCarePreviewSourceDecision =
  | { kind: "ok"; currentSessionId: string }
  | { kind: "blocked"; reason: AxisCarePreviewSourceBlocker; message: string; currentSessionId: string | null };

const blocked = (reason: AxisCarePreviewSourceBlocker, message: string, currentSessionId: string | null = null): AxisCarePreviewSourceDecision => ({
  kind: "blocked",
  reason,
  message,
  currentSessionId,
});

export function decideAxisCarePreviewSource(input: {
  requested: SessionRef | null;
  /** The canonical latest non-superseded CR_ASSESSMENT_CURRENT evidence row (null if none). */
  canonicalLatest: CurrentAssessmentEvidenceRow | null;
  /** Every non-superseded CR_ASSESSMENT_CURRENT evidence row for this resident. */
  activeEvidence: readonly CurrentAssessmentEvidenceRow[];
  /** The session the canonical latest row points to (null if not found). */
  currentSession: SessionRef | null;
}): AxisCarePreviewSourceDecision {
  const { requested } = input;
  if (!requested) return blocked("session_not_found", "Assessment session not found.");
  if (!APPROVED_SESSION_STATUSES.includes(requested.status)) {
    return blocked("requested_not_approved", "An AxisCare preview can only be generated from an approved assessment.");
  }

  const distinctSessions = new Set(input.activeEvidence.map((e) => e.sessionId).filter((id): id is string => Boolean(id)));
  if (distinctSessions.size > 1) {
    return blocked(
      "ambiguous_current_assessment",
      "More than one assessment is recorded as current for this person, so Serve can't tell which one AxisCare should reflect. Resolve the current assessment first."
    );
  }
  const currentSessionId = input.canonicalLatest?.sessionId ?? null;
  if (!currentSessionId) {
    return blocked("no_current_assessment", "This person has no current approved assessment, so there is nothing to send to AxisCare yet.");
  }
  const current = input.currentSession;
  if (!current || current.id !== currentSessionId || current.residentId !== requested.residentId || !APPROVED_SESSION_STATUSES.includes(current.status)) {
    return blocked(
      "current_assessment_inconsistent",
      "The current assessment record doesn't match an approved assessment for this person. Resolve the current assessment first.",
      currentSessionId
    );
  }
  if (requested.id !== currentSessionId) {
    return blocked(
      "requested_not_current",
      "This approved assessment is not the person's current assessment. AxisCare previews are generated only from the current assessment.",
      currentSessionId
    );
  }
  return { kind: "ok", currentSessionId };
}

/** Defensive second line: whatever rows a reader returns, only facts originating in the current
 * approved assessment may drive the assessment-derived AxisCare projection, and only human-settled
 * values (never uncertain/conflicting states — Leave Unknown / Needs follow-up never become
 * approved facts at all). */
export function approvedFactsForCurrentAssessment<T extends { originating_assessment_session_id: string; assertion_state: string }>(
  rows: readonly T[],
  currentSessionId: string
): T[] {
  return rows.filter(
    (r) => r.originating_assessment_session_id === currentSessionId && r.assertion_state !== "uncertain" && r.assertion_state !== "conflicting"
  );
}

// ─── Eventual Send lifecycle gate — INFORMATIONAL ONLY for preview ──────────────────────────────

export interface SendLifecycleState {
  serviceAgreementSigned: boolean;
  serviceAgreementStatus: string;
  relationship: string | null;
  /** Whether a future "Send to AxisCare" would currently be refused by the lifecycle gate
   * (signed Service Agreement → enrolled inactive_client). Never blocks preview generation. */
  sendWouldBeLifecycleBlocked: boolean;
  reasons: string[];
}

export function describeSendLifecycleState(input: { serviceAgreementStatus: string | null; relationship: string | null }): SendLifecycleState {
  const status = input.serviceAgreementStatus ?? "missing";
  const signed = status === "satisfied" || status === "expiring_soon";
  const reasons: string[] = [];
  if (!signed) reasons.push("A signed Service Agreement is not on file yet.");
  if (input.relationship !== "inactive_client") {
    reasons.push(
      input.relationship === "active_client"
        ? "This person is already an active client."
        : "This person is not yet an enrolled (inactive) client."
    );
  }
  return {
    serviceAgreementSigned: signed,
    serviceAgreementStatus: status,
    relationship: input.relationship,
    sendWouldBeLifecycleBlocked: reasons.length > 0,
    reasons,
  };
}
