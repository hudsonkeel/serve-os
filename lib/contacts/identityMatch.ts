// Pure, deterministic contact-identity classification (Slice C.2, 2026-09-19). Modeled on
// the DESIGN PRINCIPLES surfaced by the Slice C.1 investigation —
// lib/integrations/axiscare/clientIdentityMatching.ts's tiered, never-fuzzy match ladder
// and lib/residents/identity/confidenceBands.ts's "evidence is always a named array,
// conflicts always downgrade, never a numeric score" discipline — deliberately NOT by
// importing either module directly, since both are hardcoded to their own entities
// (AxisCare client <-> resident; resident <-> resident) in ways that don't transfer
// (apartment/community signals, resident-specific table names).
//
// This function only CLASSIFIES two contact-shaped records. It never merges, links, or
// writes anything, and it is not wired to any caller in this slice — Slice C.3 decides
// what to do with each tier (including whether/when a match this classifies as
// exact_strong_match still gets a human confirmation click; that policy decision is
// deliberately NOT encoded here — see this module's own file for why).
//
// Suppression ("these two contacts are confirmed NOT the same person",
// contact_identity_suppressions) is a persisted, I/O-backed fact this pure function has
// no way to know about — a caller must check it before creating a
// contact_identity_candidates row from any tier this function returns other than
// no_match/name_only_no_merge (which never produce a candidate row at all — see that
// table's own migration comment).

export type ContactMatchTier =
  | "exact_strong_match"
  | "proposed_match_requires_review"
  | "conflicting_identity_requires_review"
  | "name_only_no_merge"
  | "no_match";

export interface ContactForMatching {
  readonly firstName: string | null;
  readonly lastName: string | null;
  /** Already normalized (see normalization.ts) — this function does no normalization of
   * its own, so a caller can never accidentally compare raw and normalized values. */
  readonly normalizedEmail: string | null;
  readonly normalizedPhone: string | null;
}

export interface ContactMatchEvidenceSignal {
  readonly signalType: string;
  readonly description: string;
  readonly strength: "strong" | "corroborating" | "weak";
}

export interface ContactMatchResult {
  readonly tier: ContactMatchTier;
  /** Human-readable, never an opaque score — same discipline as
   * resident_identity_candidates.evidence and contact_identity_candidates.evidence. */
  readonly evidence: readonly ContactMatchEvidenceSignal[];
}

function normalizedFullName(contact: ContactForMatching): string | null {
  const combined = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");
  return combined.length > 0 ? combined : null;
}

function normalizedLastName(contact: ContactForMatching): string | null {
  const trimmed = (contact.lastName ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** true = both present and equal; false = both present and different; null = at least
 * one side unknown — genuinely no basis for agreement OR conflict. Never treats "unknown"
 * as either a match or a conflict. */
function agreement(a: string | null, b: string | null): boolean | null {
  if (a === null || b === null) return null;
  return a === b;
}

/** Classifies whether two contact records could represent the same real person.
 * Deterministic and rule-based — never a numeric fuzzy score (Slice C.1 investigation
 * principle). See this module's header for what it deliberately does not decide. */
export function classifyContactMatch(a: ContactForMatching, b: ContactForMatching): ContactMatchResult {
  const evidence: ContactMatchEvidenceSignal[] = [];

  const emailAgreement = agreement(a.normalizedEmail, b.normalizedEmail);
  const phoneAgreement = agreement(a.normalizedPhone, b.normalizedPhone);
  const fullNameAgreement = agreement(normalizedFullName(a), normalizedFullName(b));
  const lastNameAgreement = agreement(normalizedLastName(a), normalizedLastName(b));

  const hasStrongMatch = emailAgreement === true || phoneAgreement === true;
  const hasStrongConflict = emailAgreement === false || phoneAgreement === false;

  if (emailAgreement === true) {
    evidence.push({ signalType: "email", description: "Normalized email addresses match exactly.", strength: "strong" });
  }
  if (phoneAgreement === true) {
    evidence.push({ signalType: "phone", description: "Normalized phone numbers match exactly.", strength: "strong" });
  }
  if (emailAgreement === false) {
    evidence.push({
      signalType: "email_conflict",
      description: "Both records have a confirmed email address, but they differ.",
      strength: "strong",
    });
  }
  if (phoneAgreement === false) {
    evidence.push({
      signalType: "phone_conflict",
      description: "Both records have a confirmed phone number, but they differ.",
      strength: "strong",
    });
  }

  // Conflicting strong identifiers are never silently merged, even when the names agree
  // (or are unknown) — a confirmed differing phone/email is real, independent evidence
  // these might not be the same person, and never gets outvoted by anything else here.
  if (hasStrongConflict) {
    if (fullNameAgreement === true) {
      evidence.push({
        signalType: "name",
        description: "Names agree, but a confirmed strong identifier conflicts — never silently merged.",
        strength: "corroborating",
      });
    }
    return { tier: "conflicting_identity_requires_review", evidence };
  }

  if (hasStrongMatch) {
    // A shared email/phone can mean the same HOUSEHOLD, not the same person — if the
    // names actively disagree, this is a review case, never an automatic match.
    if (fullNameAgreement === false) {
      evidence.push({
        signalType: "name_conflict",
        description:
          "A strong identifier matches, but the names on the two records disagree — a shared email or phone can mean the same household, not the same person.",
        strength: "weak",
      });
      return { tier: "conflicting_identity_requires_review", evidence };
    }
    if (fullNameAgreement === true) {
      evidence.push({ signalType: "name", description: "Names on both records also agree.", strength: "corroborating" });
    }
    return { tier: "exact_strong_match", evidence };
  }

  // No strong identifier match or conflict at all beyond this point.

  if (fullNameAgreement === true) {
    evidence.push({
      signalType: "name_only",
      description: "Names match, but no strong identifier (email or phone) corroborates it — never sufficient to merge.",
      strength: "weak",
    });
    return { tier: "name_only_no_merge", evidence };
  }

  // A shared surname alone, with no full-name match and no strong identifier, is a real
  // but weak partial signal — surfaced for human review, exactly like
  // clientIdentityMatching.ts's "surname_and_community" tier always requires review.
  if (lastNameAgreement === true) {
    evidence.push({
      signalType: "surname_only",
      description:
        "Last names match, but first names differ or are unknown, and no strong identifier corroborates it — surfaced for review, never auto-merged.",
      strength: "weak",
    });
    return { tier: "proposed_match_requires_review", evidence };
  }

  return { tier: "no_match", evidence: [] };
}
