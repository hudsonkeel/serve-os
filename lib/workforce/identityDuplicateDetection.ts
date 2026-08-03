// Pure normalization + duplicate-candidate matching for AxisCare identity
// links — the "other AxisCare records with matching normalized name/email/
// phone" surface required on the identity review queue, and the basis for
// the pre-rejection warning. See
// docs/architecture/SERVE_OS_NAVIGATION_MODEL.md's Workforce section and
// supabase/migrations/20260811000000_add_vendor_identity_lineage.sql.
//
// Deliberately does not decide anything — never auto-merges, auto-links,
// or auto-rejects. It only surfaces candidates and a warning; a human
// reviewer chooses the actual action.
import type { PersonVendorIdentityLink } from "../supabase/types.ts";

interface AxisCareIdentityFields {
  firstName?: string | null;
  lastName?: string | null;
  goesBy?: string | null;
  statusActive?: boolean | null;
  personalEmail?: string | null;
  mobilePhone?: string | null;
  homePhone?: string | null;
}

export function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Keep the last 10 digits so a leading "1" country code doesn't prevent
  // an otherwise-identical number from matching.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export interface CandidateIdentity {
  linkId: string;
  normalizedFullName: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  statusActive: boolean | null;
  isConfirmed: boolean;
}

function fullName(fields: AxisCareIdentityFields): string | null {
  const preferred = fields.goesBy?.trim() || fields.firstName?.trim() || "";
  const last = fields.lastName?.trim() ?? "";
  const combined = `${preferred} ${last}`.trim();
  return combined.length > 0 ? combined : null;
}

export function extractCandidateIdentity(link: PersonVendorIdentityLink): CandidateIdentity {
  const source = (link.approved_source_data ?? {}) as AxisCareIdentityFields;
  return {
    linkId: link.id,
    normalizedFullName: normalizeName(fullName(source) ?? link.vendor_display_name),
    normalizedEmail: normalizeEmail(source.personalEmail),
    normalizedPhone: normalizePhone(source.mobilePhone ?? source.homePhone),
    statusActive: source.statusActive ?? null,
    isConfirmed: link.status === "confirmed",
  };
}

function identitiesMatch(a: CandidateIdentity, b: CandidateIdentity): boolean {
  if (a.normalizedEmail && b.normalizedEmail && a.normalizedEmail === b.normalizedEmail) return true;
  if (a.normalizedPhone && b.normalizedPhone && a.normalizedPhone === b.normalizedPhone) return true;
  if (a.normalizedFullName && b.normalizedFullName && a.normalizedFullName === b.normalizedFullName) return true;
  return false;
}

// Other links from the same source (excluding the link itself) whose
// normalized name, email, or phone matches — shown alongside a proposed
// link in the review queue. Never automatically linked or merged.
export function findPotentialDuplicateLinks(
  link: PersonVendorIdentityLink,
  candidates: PersonVendorIdentityLink[]
): PersonVendorIdentityLink[] {
  const target = extractCandidateIdentity(link);
  if (!target.normalizedFullName && !target.normalizedEmail && !target.normalizedPhone) return [];

  return candidates.filter((candidate) => {
    if (candidate.id === link.id) return false;
    if (candidate.source_system !== link.source_system) return false;
    return identitiesMatch(target, extractCandidateIdentity(candidate));
  });
}

export interface IdentityRejectionWarning {
  shouldWarn: boolean;
  reasons: string[];
}

// Before rejecting a proposed link, warn when a candidate exists that looks
// like the same person — the exact gap that let the Locardia case's wrong
// record get confirmed with no visibility into her other AxisCare record.
// This never blocks the rejection; it only recommends reviewing both
// together (requirement 5).
export function buildIdentityRejectionWarning(
  link: PersonVendorIdentityLink,
  candidates: PersonVendorIdentityLink[]
): IdentityRejectionWarning {
  const duplicates = findPotentialDuplicateLinks(link, candidates);
  if (duplicates.length === 0) return { shouldWarn: false, reasons: [] };

  const target = extractCandidateIdentity(link);
  const reasons: string[] = [];

  const sameNameAndContact = duplicates.some((d) => {
    const other = extractCandidateIdentity(d);
    const sameName = target.normalizedFullName && target.normalizedFullName === other.normalizedFullName;
    const matchingContact =
      (target.normalizedEmail && target.normalizedEmail === other.normalizedEmail) ||
      (target.normalizedPhone && target.normalizedPhone === other.normalizedPhone);
    return sameName && matchingContact;
  });
  if (sameNameAndContact) {
    reasons.push("Another AxisCare identity has the same name and a matching email or phone number.");
  }

  const linkedCandidate = duplicates.some((d) => extractCandidateIdentity(d).isConfirmed);
  if (linkedCandidate) {
    reasons.push("Another linked AxisCare record appears to represent the same person.");
  }

  const activeInactiveSplit = duplicates.some((d) => {
    const other = extractCandidateIdentity(d);
    return (
      target.statusActive !== null &&
      other.statusActive !== null &&
      target.statusActive !== other.statusActive
    );
  });
  if (activeInactiveSplit) {
    reasons.push("One candidate record is active while the other is inactive.");
  }

  if (reasons.length === 0) {
    reasons.push("Another AxisCare record with similar identity details was found.");
  }

  return { shouldWarn: true, reasons };
}
