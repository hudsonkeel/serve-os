// Platform-level Compliance Status calculation — the shared layer between
// Verification and Domain Interpretation in the hierarchy established by
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql:
//
//   Subject -> Requirement Set -> Requirements -> Evidence -> Verification
//     -> Compliance Status (here) -> Domain Interpretation (per-domain)
//
// Evaluates evidence along two independent dimensions, matching the
// database's own person_evidence.verification_status / lifecycle_status
// split — never collapsed into one:
//   - verification_status: was this evidence reviewed and found correct?
//   - lifecycle_status: is this evidence still the current record?
// A verified-then-superseded (or verified-then-expired) row keeps its
// verification judgment on the historical record; it simply stops being
// the row this function considers "current" for the requirement.
//
// Pure, deterministic, no I/O, and — deliberately — no knowledge of
// Workforce, Hiring, QAPI, or any other consuming domain. Any future domain
// calls evaluateRequirementSetStatus() with its own subject/set and applies
// its own labels/copy on top; this function never changes to accommodate a
// specific domain's vocabulary.
import type { PersonEvidence, PersonRequirement } from "../supabase/types.ts";

export type RequirementSetStatus =
  | "complete"
  | "incomplete"
  | "awaiting_verification"
  | "requires_review"
  | "expired"
  | "expiring_soon"
  | "not_applicable";

export type RequirementStatus =
  | "satisfied"
  | "missing"
  | "awaiting_verification"
  | "requires_review"
  | "expired"
  | "expiring_soon";

// Warning window for "expiring soon" — a shipped, sensible default, not an
// adopted policy threshold. Flagged for explicit approval before any
// requirement relies on it to change who's shown as ready to work.
export const EXPIRING_SOON_WINDOW_DAYS = 30;

export interface RequirementEvaluation {
  requirement: PersonRequirement;
  status: RequirementStatus;
  latestEvidence: PersonEvidence | null;
  explanation: string;
}

export interface RequirementSetEvaluation {
  status: RequirementSetStatus;
  explanation: string;
  requirements: RequirementEvaluation[];
}

// A superseded row is never "current" for its requirement, regardless of
// its verification_status — it has been explicitly replaced.
function isCurrentEvidence(e: PersonEvidence): boolean {
  return e.lifecycle_status !== "superseded";
}

// There is no scheduled job in this codebase to flip lifecycle_status to
// 'expired' as calendar time passes (see
// docs/integrations/AXISCARE_READ_ONLY_INTEGRATION.md — no cron anywhere
// in this repo), so a past expiration_date is treated as effectively
// expired at evaluation time even when the stored column still says
// 'active'. An explicitly stored 'expired' (e.g. from a future scheduled
// job or admin action — see lib/data/personEvidence.ts's
// markPersonEvidenceExpired()) is always honored directly.
function effectiveLifecycleStatus(e: PersonEvidence, now: () => Date): "active" | "expired" {
  if (e.lifecycle_status === "expired") return "expired";
  if (e.expiration_date !== null && new Date(e.expiration_date).getTime() < now().getTime()) {
    return "expired";
  }
  return "active";
}

// Active, not-yet-expired evidence whose expiration_date falls within the
// warning window — a distinct, milder condition than "expired": still
// currently satisfies the requirement, but needs attention before it
// doesn't.
function isExpiringSoon(e: PersonEvidence, now: () => Date): boolean {
  if (e.expiration_date === null) return false;
  const msUntilExpiration = new Date(e.expiration_date).getTime() - now().getTime();
  if (msUntilExpiration < 0) return false; // already expired — effectiveLifecycleStatus's concern, not this one
  return msUntilExpiration <= EXPIRING_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// A score-gated requirement (required_score set) is never satisfied by
// verified evidence alone — the recorded numeric_score must meet the bar.
// Below-threshold evidence is treated the same as rejected evidence
// (requires_review): it was reviewed, and found not to meet the standard.
function meetsScoreThreshold(requirement: PersonRequirement, evidence: PersonEvidence): boolean {
  if (requirement.required_score === null) return true;
  return evidence.numeric_score !== null && evidence.numeric_score >= requirement.required_score;
}

function mostRecentEvidenceForRequirement(
  requirementId: string,
  evidence: readonly PersonEvidence[]
): PersonEvidence | null {
  const candidates = evidence
    .filter((e) => e.requirement_id === requirementId && isCurrentEvidence(e))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return candidates[0] ?? null;
}

function evaluateRequirement(
  requirement: PersonRequirement,
  evidence: readonly PersonEvidence[],
  now: () => Date
): RequirementEvaluation {
  const latest = mostRecentEvidenceForRequirement(requirement.id, evidence);

  if (!latest) {
    return {
      requirement,
      status: "missing",
      latestEvidence: null,
      explanation: `${requirement.name} is missing — no evidence has been recorded.`,
    };
  }

  // Lifecycle dimension first: an expired row is expired regardless of
  // whether it was ever verified — currency and correctness are
  // independent questions, but an expired requirement always needs fresh
  // evidence no matter how the old evidence was judged.
  if (effectiveLifecycleStatus(latest, now) === "expired") {
    return {
      requirement,
      status: "expired",
      latestEvidence: latest,
      explanation: `${requirement.name} evidence has expired${latest.expiration_date ? ` (expired ${latest.expiration_date})` : ""}.`,
    };
  }

  // Verification dimension, only reached for currently-active evidence.
  if (latest.verification_status === "verified") {
    if (!meetsScoreThreshold(requirement, latest)) {
      return {
        requirement,
        status: "requires_review",
        latestEvidence: latest,
        explanation:
          latest.numeric_score !== null
            ? `${requirement.name} evidence scored ${latest.numeric_score}, below the required ${requirement.required_score} — requires review.`
            : `${requirement.name} requires a recorded score of at least ${requirement.required_score} — none was recorded.`,
      };
    }

    if (isExpiringSoon(latest, now)) {
      return {
        requirement,
        status: "expiring_soon",
        latestEvidence: latest,
        explanation: `${requirement.name} is satisfied but expires ${latest.expiration_date} — renewal needed soon.`,
      };
    }

    return {
      requirement,
      status: "satisfied",
      latestEvidence: latest,
      explanation: `${requirement.name} is satisfied — verified.`,
    };
  }

  if (latest.verification_status === "rejected") {
    return {
      requirement,
      status: "requires_review",
      latestEvidence: latest,
      explanation: `${requirement.name} evidence was rejected and requires review.`,
    };
  }

  // 'unverified' — evidence exists, hasn't been verified yet.
  return {
    requirement,
    status: "awaiting_verification",
    latestEvidence: latest,
    explanation: `${requirement.name} evidence has been recorded but not yet verified.`,
  };
}

// Requirements passed in should already be filtered to the ones a
// Requirement Set actually contains (see
// lib/data/personRequirements.ts's getRequirementSetWithRequirements()) and
// evidence should already be filtered to the subject in question (see
// lib/data/personEvidence.ts's getPersonEvidenceForSubject()) — this
// function does no subject/set filtering of its own.
export function evaluateRequirementSetStatus(
  requirements: readonly PersonRequirement[],
  evidence: readonly PersonEvidence[],
  now: () => Date = () => new Date()
): RequirementSetEvaluation {
  if (requirements.length === 0) {
    return {
      status: "not_applicable",
      explanation: "This requirement set has no active requirements.",
      requirements: [],
    };
  }

  const evaluations = requirements.map((r) => evaluateRequirement(r, evidence, now));

  // Precedence: expired > requires_review > incomplete (something entirely
  // missing) > awaiting_verification > expiring_soon > complete. An active
  // problem (expired/requires_review) always outranks "not done yet"; a
  // fully missing requirement outranks one that's merely pending
  // verification, since it represents no progress at all rather than
  // progress awaiting sign-off. expiring_soon is the mildest condition —
  // everything is currently satisfied, but something needs attention soon
  // — so it ranks below every other open problem and above "complete."
  const hasExpired = evaluations.some((e) => e.status === "expired");
  const hasRequiresReview = evaluations.some((e) => e.status === "requires_review");
  const hasMissing = evaluations.some((e) => e.status === "missing");
  const hasAwaitingVerification = evaluations.some((e) => e.status === "awaiting_verification");
  const hasExpiringSoon = evaluations.some((e) => e.status === "expiring_soon");

  if (hasExpired) {
    const first = evaluations.find((e) => e.status === "expired")!;
    return { status: "expired", explanation: first.explanation, requirements: evaluations };
  }

  if (hasRequiresReview) {
    const first = evaluations.find((e) => e.status === "requires_review")!;
    return { status: "requires_review", explanation: first.explanation, requirements: evaluations };
  }

  if (hasMissing) {
    const first = evaluations.find((e) => e.status === "missing")!;
    return {
      status: "incomplete",
      explanation: `Incomplete because ${first.explanation.charAt(0).toLowerCase()}${first.explanation.slice(1)}`,
      requirements: evaluations,
    };
  }

  if (hasAwaitingVerification) {
    const first = evaluations.find((e) => e.status === "awaiting_verification")!;
    return { status: "awaiting_verification", explanation: first.explanation, requirements: evaluations };
  }

  if (hasExpiringSoon) {
    const first = evaluations.find((e) => e.status === "expiring_soon")!;
    return { status: "expiring_soon", explanation: first.explanation, requirements: evaluations };
  }

  return { status: "complete", explanation: "All requirements are satisfied and verified.", requirements: evaluations };
}
