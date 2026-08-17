// Audit Readiness's Domain Interpretation of the shared, domain-agnostic
// engine in requirementSetStatus.ts — mirrors
// lib/workforce/employeeRecordAuditReadiness.ts's own pattern exactly:
// this file knows about the Audit Readiness product vocabulary
// (COMPLIANT/DUE_SOON/DUE/OVERDUE/MISSING_EVIDENCE/NEEDS_REVIEW/
// NOT_APPLICABLE/EXCEPTION/SATISFIED_BY_EVENT); it never recomputes status
// from raw evidence itself — that stays evaluateRequirementSetStatus()'s
// job, reused completely unchanged, exactly as the spec requires ("Do not
// create a second compliance evaluator").
//
// EXCEPTION and SATISFIED_BY_EVENT are deliberately NOT new engine states.
// The engine only ever sees "satisfied" for a requirement backed by
// current, verified evidence — nothing more. Whether that verified
// evidence represents an ordinary compliant record, a documented
// qualifying event (e.g. Serve P&P §256's own "...in a planned drill if
// not tested during an actual emergency response" clause), or an approved
// exception is a presentation-layer question about *why* the evidence
// exists, not a different compliance outcome — so it is expressed via an
// optional classifier callback a domain supplies, never by widening the
// shared engine's RequirementStatus union (which would force every
// existing exhaustive switch in lib/workforce/* to change for a case that
// has nothing to do with workforce).
import type { RequirementEvaluation, RequirementSetEvaluation } from "./requirementSetStatus.ts";
import type { PersonEvidence } from "../supabase/types.ts";

export type AuditReadinessStatus =
  | "compliant"
  | "due_soon"
  | "due"
  | "overdue"
  | "missing_evidence"
  | "needs_review"
  | "not_applicable"
  | "exception"
  | "satisfied_by_event";

export interface EvidenceSatisfactionClassification {
  status: "compliant" | "satisfied_by_event" | "exception";
  explanation: string;
}

// A domain (e.g. Emergency Preparedness) supplies this to explain *how*
// otherwise-"satisfied" evidence came to satisfy the requirement — return
// null for the ordinary case (no override; the default "compliant" label
// applies). This file has no knowledge of any specific domain's
// classification rules, matching requirementSetStatus.ts's own
// no-domain-knowledge discipline.
export type EvidenceSatisfactionClassifier = (
  evidence: PersonEvidence
) => EvidenceSatisfactionClassification | null;

export interface AuditReadinessRequirementEvaluation {
  status: AuditReadinessStatus;
  explanation: string;
  requirementEvaluation: RequirementEvaluation;
}

export interface AuditReadinessSetEvaluation {
  status: AuditReadinessStatus;
  explanation: string;
  requirements: AuditReadinessRequirementEvaluation[];
}

// "due" is reserved but currently unreachable — same disclosed-but-
// unreachable pattern lib/workforce/evidenceAssurance.ts already uses for
// its "Inferred" level. Distinguishing "not yet due" from "missing
// evidence" for a requirement with no evidence at all requires a
// frequency + last-completed-date cadence calculation that does not exist
// anywhere in this codebase yet (see the Phase 0 report's cadence-engine
// gap finding). Reserved here so this type's shape doesn't need to change
// again once that cadence layer exists — most likely on top of Emergency
// Preparedness's actual frequency requirements once they're approved.
function mapRequirementStatus(
  evaluation: RequirementEvaluation,
  classify?: EvidenceSatisfactionClassifier
): AuditReadinessRequirementEvaluation {
  if (evaluation.status === "satisfied") {
    const override = classify && evaluation.latestEvidence ? classify(evaluation.latestEvidence) : null;
    if (override) {
      return { status: override.status, explanation: override.explanation, requirementEvaluation: evaluation };
    }
    return { status: "compliant", explanation: evaluation.explanation, requirementEvaluation: evaluation };
  }

  switch (evaluation.status) {
    case "missing":
      return { status: "missing_evidence", explanation: evaluation.explanation, requirementEvaluation: evaluation };
    case "awaiting_verification":
    case "requires_review":
      return { status: "needs_review", explanation: evaluation.explanation, requirementEvaluation: evaluation };
    case "expired":
      return { status: "overdue", explanation: evaluation.explanation, requirementEvaluation: evaluation };
    case "expiring_soon":
      return { status: "due_soon", explanation: evaluation.explanation, requirementEvaluation: evaluation };
  }
}

function mapSetStatus(setStatus: RequirementSetEvaluation["status"]): AuditReadinessStatus {
  switch (setStatus) {
    case "complete":
      return "compliant";
    case "incomplete":
      return "missing_evidence";
    case "awaiting_verification":
    case "requires_review":
      return "needs_review";
    case "expired":
      return "overdue";
    case "expiring_soon":
      return "due_soon";
    case "not_applicable":
      return "not_applicable";
  }
}

// Translates a full RequirementSetEvaluation (from
// evaluateRequirementSetStatus(), called exactly as every existing domain
// already calls it — no new evaluation path) into the Audit Readiness
// product vocabulary. The set-level status/explanation is derived
// independently from the engine's own set-level result (so it never
// disagrees with what the engine actually decided); the per-requirement
// array carries each requirement's own possibly-overridden status for
// drill-down, e.g. a set that's "compliant" overall because every
// requirement is satisfied, where one requirement happens to be
// satisfied_by_event rather than by an ordinary planned record.
export function deriveAuditReadinessStatus(
  setEvaluation: RequirementSetEvaluation,
  classify?: EvidenceSatisfactionClassifier
): AuditReadinessSetEvaluation {
  return {
    status: mapSetStatus(setEvaluation.status),
    explanation: setEvaluation.explanation,
    requirements: setEvaluation.requirements.map((r) => mapRequirementStatus(r, classify)),
  };
}
