// Recruiting-lead-to-workforce-member lifecycle reconciliation. Post-
// Release Stabilization, AxisCare Operational Synchronization,
// Workstream 3. A recruiting lead confidently linked to a workforce
// member who is already active (per a confirmed AxisCare caregiver
// link) should resolve to the existing "hired" terminal status — never a
// new, duplicate terminal state. See
// docs/architecture/RECRUITING_WORKFORCE_RECONCILIATION.md.

export interface WorkforceLinkEvidence {
  readonly workforceMemberId: string;
  // True only when person_vendor_identity_links has a status='confirmed'
  // row for this workforce member with an AxisCare-reported active
  // caregiver status — never inferred from name alone.
  readonly hasConfirmedActiveAxisCareLink: boolean;
}

export type RecruitingResolutionBasis =
  | "confirmed_workforce_link"
  | "confirmed_vendor_identity"
  | "exact_email"
  | "exact_phone"
  | "name_plus_corroborating_evidence"
  | "name_only";

export interface RecruitingResolutionResult {
  readonly shouldResolve: boolean;
  readonly basis: RecruitingResolutionBasis | null;
  readonly requiresReview: boolean;
  readonly reason: string;
}

export interface RecruitingLeadForResolution {
  readonly id: string;
  readonly normalizedEmail: string | null;
  readonly normalizedPhone: string | null;
  readonly normalizedName: string;
  // A recruiting_leads row already has source_recruiting_lead_id set on
  // some workforce_members row — the only tier that resolves without
  // review, since it is an existing, structural, already-established
  // link (see lib/actions/... wherever a future conversion flow writes
  // it), not a lookup performed here.
  readonly linkedWorkforceMemberId: string | null;
}

export interface WorkforceCandidateForResolution {
  readonly workforceMemberId: string;
  readonly normalizedEmail: string | null;
  readonly normalizedPhone: string | null;
  readonly normalizedName: string;
  readonly hasConfirmedActiveAxisCareLink: boolean;
  // Corroborating evidence beyond name — e.g. a human-written
  // reconciliation note (recruiting_leads.raw_submission) whose vendor
  // observation dates (Apploi/Viventium) are consistent with the
  // workforce member's AxisCare hireDate/startDate. Passed in already
  // evaluated by the caller — this module never re-derives it.
  readonly hasCorroboratingEvidence: boolean;
}

export function evaluateRecruitingToWorkforceResolution(
  lead: RecruitingLeadForResolution,
  candidate: WorkforceCandidateForResolution | null
): RecruitingResolutionResult {
  if (lead.linkedWorkforceMemberId) {
    return {
      shouldResolve: true,
      basis: "confirmed_workforce_link",
      requiresReview: false,
      reason: "This lead is already structurally linked to a workforce member (source_recruiting_lead_id).",
    };
  }

  if (!candidate) {
    return { shouldResolve: false, basis: null, requiresReview: false, reason: "No candidate workforce member found." };
  }

  if (!candidate.hasConfirmedActiveAxisCareLink) {
    return {
      shouldResolve: false,
      basis: null,
      requiresReview: false,
      reason: "Candidate workforce member has no confirmed, active AxisCare link yet.",
    };
  }

  if (lead.normalizedEmail && lead.normalizedEmail === candidate.normalizedEmail) {
    return { shouldResolve: true, basis: "exact_email", requiresReview: false, reason: "Exact email match." };
  }

  if (lead.normalizedPhone && lead.normalizedPhone === candidate.normalizedPhone) {
    return { shouldResolve: true, basis: "exact_phone", requiresReview: false, reason: "Exact phone match." };
  }

  const namesMatch = lead.normalizedName === candidate.normalizedName;

  if (namesMatch && candidate.hasCorroboratingEvidence) {
    return {
      shouldResolve: true,
      basis: "name_plus_corroborating_evidence",
      requiresReview: true,
      reason:
        "Exact name match with corroborating evidence (e.g. a human reconciliation note whose vendor observations are consistent with the workforce member's hire timeline) — strong, but no email/phone match exists, so this still requires explicit human approval before resolving.",
    };
  }

  if (namesMatch) {
    return {
      shouldResolve: false,
      basis: "name_only",
      requiresReview: true,
      reason: "Name matches, but with no corroborating evidence and no email/phone match — never auto-resolved on name alone.",
    };
  }

  return { shouldResolve: false, basis: null, requiresReview: false, reason: "No match." };
}
