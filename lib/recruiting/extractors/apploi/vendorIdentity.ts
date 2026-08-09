// Apploi vendor identity — URL parsing and the pure linking decision. See
// docs/architecture/APPLOI_EVIDENCE_RECONNAISSANCE_PLAN.md Phase 4.
//
// candidateID is the primary vendor_record_id (one candidate). applicationID
// is retained separately in provenance/metadata, never folded into
// vendor_record_id — one candidate may eventually have more than one
// application. Both are parsed from the confirmed tab's own URL; neither is
// ever hardcoded for a specific person.
import type { RecruitingLeadVendorIdentity } from "../../../supabase/types.ts";

export interface ApploiUrlIdentifiers {
  readonly candidateId: string | null;
  readonly applicationId: string | null;
}

export function parseApploiCandidateUrl(url: string): ApploiUrlIdentifiers {
  try {
    const parsed = new URL(url);
    return {
      candidateId: parsed.searchParams.get("candidateID"),
      applicationId: parsed.searchParams.get("applicationID"),
    };
  } catch {
    return { candidateId: null, applicationId: null };
  }
}

// The one place the "verify or establish" decision (objective 10 of the
// approved plan) is made — pure, so it's testable without a live vendor
// identity table. The caller (the collector script) is the only place that
// actually prompts a human or writes to Supabase; this function only
// decides what should happen given the current stored state.
export type VendorIdentityDecision =
  | { readonly action: "requires_confirmation"; readonly candidateId: string }
  | { readonly action: "proceed_confirmed"; readonly candidateId: string }
  | { readonly action: "proceed_unconfirmed"; readonly candidateId: string }
  | { readonly action: "hard_stop_mismatch"; readonly storedCandidateId: string; readonly observedCandidateId: string }
  | { readonly action: "hard_stop_no_candidate_id" };

export function decideVendorIdentityAction(
  observedCandidateId: string | null,
  existing: RecruitingLeadVendorIdentity | null
): VendorIdentityDecision {
  if (!observedCandidateId) {
    return { action: "hard_stop_no_candidate_id" };
  }

  if (!existing) {
    return { action: "requires_confirmation", candidateId: observedCandidateId };
  }

  if (existing.vendor_record_id !== observedCandidateId) {
    return {
      action: "hard_stop_mismatch",
      storedCandidateId: existing.vendor_record_id,
      observedCandidateId,
    };
  }

  return existing.is_human_confirmed
    ? { action: "proceed_confirmed", candidateId: observedCandidateId }
    : { action: "proceed_unconfirmed", candidateId: observedCandidateId };
}

// Display-safe shortening — vendor identifiers (Apploi's are base64-encoded
// GraphQL global IDs, e.g. "Q2FuZGlkYXRlOjc2MzY0MTEy") are never shown in
// full in a prominent UI location; the full value stays available through a
// controlled detail view only.
export function shortenVendorId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
