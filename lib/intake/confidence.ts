import type { IntakeConfidenceBand, IntakeReasonCode } from "./types";

// Deterministic confidence scoring — see docs/design/
// SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Confidence model." This is NOT
// machine-learning probability; it is a documented completeness/rule-
// certainty score. The same reason codes always produce the same score —
// no randomness, no model inference, no hidden state.
//
// Base score of 50 (a "we have something, but haven't confirmed
// anything" starting point) with fixed additions/deductions per reason
// code, clamped to [0, 100].

const BASE_SCORE = 50;

const ADDITIONS: Partial<Record<IntakeReasonCode, number>> = {
  WATERMERE_SELECTED: 10,
  EXTERNAL_LOCATION_SELECTED: 10,
  RESIDENT_EXACT_MATCH: 40,
  RESIDENT_NAME_UNIT_MATCH: 30,
  PROSPECTIVE_CLIENT_IDENTITY_COMPLETE: 15,
  PRIMARY_CONTACT_IDENTITY_COMPLETE: 15,
  SERVICE_LOCATION_COMPLETE: 15,
  CONTACT_METHOD_PRESENT: 10,
  SERVICE_NEED_PRESENT: 5,
  TIMING_PRESENT: 5,
  REFERRAL_ORGANIZATION_COMPLETE: 20,
  EMPLOYMENT_ROLE_IDENTIFIED: 20,
};

const DEDUCTIONS: Partial<Record<IntakeReasonCode, number>> = {
  RESIDENT_MATCH_REQUIRED: -30,
  MULTIPLE_RESIDENT_MATCHES: -30,
  INSUFFICIENT_RESIDENT_IDENTITY: -30,
  PROSPECTIVE_CLIENT_NAME_NOT_COLLECTED: -25,
  PRIMARY_CONTACT_IDENTITY_INCOMPLETE: -20,
  SERVICE_LOCATION_INCOMPLETE: -25,
  CONTACT_METHOD_MISSING: -50,
  POSSIBLE_DUPLICATE_RELATIONSHIP: -20,
  REFERRAL_IDENTITY_INCOMPLETE: -25,
  EMPLOYMENT_IDENTITY_INCOMPLETE: -25,
  UNSUPPORTED_INTAKE_TYPE: -60,
  UNKNOWN_SCHEMA: -60,
  DUPLICATE_SUBMISSION_NO_NEW_INFO: -10,
};

export function scoreIntakeSubmission(reasonCodes: readonly IntakeReasonCode[]): number {
  let score = BASE_SCORE;
  for (const code of reasonCodes) {
    score += ADDITIONS[code] ?? 0;
    score += DEDUCTIONS[code] ?? 0;
  }
  return Math.max(0, Math.min(100, score));
}

// Bands (Part 5):
//   100      -> automatic         ("fully deterministic classification and identity match")
//   90-99    -> high_confidence
//   70-89    -> review_recommended
//   below 70 -> needs_review
export function confidenceBandForScore(score: number): IntakeConfidenceBand {
  if (score >= 100) return "automatic";
  if (score >= 90) return "high_confidence";
  if (score >= 70) return "review_recommended";
  return "needs_review";
}
