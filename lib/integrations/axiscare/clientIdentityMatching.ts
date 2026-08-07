// Deterministic AxisCare client -> Serve resident identity matching.
// Post-Release Stabilization, AxisCare Operational Synchronization,
// Workstream 2, Phase C. Matching order, strictly: confirmed AxisCare
// client ID link (handled by the caller before this runs, via
// person_vendor_identity_links — not modeled here) -> exact normalized
// email -> exact normalized phone -> exact name+apartment ->
// exact name+community. Fuzzy/household evidence is never auto-matched
// here — it is surfaced as "needs_review" for a human.

export interface NormalizedResidentCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly normalizedEmail: string | null;
  readonly normalizedPhones: readonly string[];
  readonly normalizedName: string;
  // Optional — only populated by callers that want the
  // surname_and_community review tier below. Existing callers that omit
  // it are unaffected; that tier simply never fires for them.
  readonly normalizedLastName?: string | null;
  readonly unitNumber: string | null;
  readonly communityName: string | null;
}

export type ClientMatchBasis =
  | "email"
  | "phone"
  | "name_and_apartment"
  | "name_and_community"
  | "surname_and_community"
  | "none";

export interface ClientMatchResult {
  readonly residentId: string | null;
  readonly basis: ClientMatchBasis;
  // A phone/email match whose name disagrees, or two AxisCare clients
  // resolving to the same resident row, is a real, surfaced ambiguity —
  // never silently accepted as confirmed.
  readonly requiresReview: boolean;
  readonly reviewReason: string | null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  return trimmed || null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
  return digits.length === 10 ? digits : null;
}

export function normalizeName(firstName: string, lastName: string): string {
  const combined = `${firstName} ${lastName}`;
  // AxisCare sometimes embeds a nickname directly in firstName instead of
  // its own dedicated goesBy field — live-confirmed on two real records
  // ("Michelle (Mick)" Helsley, AxisCare #11; "Kathryn (Kathy)" Morshed,
  // AxisCare #13 — both with goesBy left empty). Stripping any
  // parenthetical annotation here is safe for Serve resident names too,
  // which are built from separate first_name/last_name columns and never
  // contain one.
  const withoutParenthetical = combined.replace(/\([^)]*\)/g, " ");
  return withoutParenthetical.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeLastName(lastName: string): string {
  return lastName.trim().toLowerCase();
}

// A small, explicit denylist of AxisCare client names observed live to be
// placeholder/template/internal rows, never real residents — "Client
// Lead", "New Client", "Integration Test", "Micah Test", "Serve Office".
// Deliberately a short, reviewable list rather than a heuristic pattern,
// so a real resident whose name happens to contain "test" is never
// silently excluded.
const KNOWN_NON_RESIDENT_NAMES = new Set([
  "client lead",
  "new client",
  "integration test",
  "micah test",
  "serve office",
]);

export function isKnownNonResidentAxisCareClient(normalizedName: string): boolean {
  return KNOWN_NON_RESIDENT_NAMES.has(normalizedName);
}

export function matchAxisCareClientToResident(
  client: {
    readonly normalizedEmail: string | null;
    readonly normalizedPhones: readonly string[];
    readonly normalizedName: string;
    readonly normalizedLastName?: string | null;
    readonly unitNumber: string | null;
    readonly communityName: string | null;
  },
  residents: readonly NormalizedResidentCandidate[]
): ClientMatchResult {
  if (client.normalizedEmail) {
    const byEmail = residents.find((r) => r.normalizedEmail === client.normalizedEmail);
    if (byEmail) {
      return { residentId: byEmail.id, basis: "email", requiresReview: false, reviewReason: null };
    }
  }

  for (const phone of client.normalizedPhones) {
    const byPhone = residents.find((r) => r.normalizedPhones.includes(phone));
    if (byPhone) {
      const namesAgree = byPhone.normalizedName === client.normalizedName;
      return {
        residentId: byPhone.id,
        basis: "phone",
        requiresReview: !namesAgree,
        reviewReason: namesAgree
          ? null
          : `Phone matches resident "${byPhone.displayName}", but the AxisCare client name ("${client.normalizedName}") does not match — confirm whether this is the same person (e.g. a shared household line) before accepting.`,
      };
    }
  }

  if (client.unitNumber) {
    const byNameAndUnit = residents.find(
      (r) => r.normalizedName === client.normalizedName && r.unitNumber === client.unitNumber
    );
    if (byNameAndUnit) {
      return { residentId: byNameAndUnit.id, basis: "name_and_apartment", requiresReview: false, reviewReason: null };
    }
  }

  if (client.communityName) {
    const byNameAndCommunity = residents.find(
      (r) => r.normalizedName === client.normalizedName && r.communityName === client.communityName
    );
    if (byNameAndCommunity) {
      return { residentId: byNameAndCommunity.id, basis: "name_and_community", requiresReview: false, reviewReason: null };
    }

    // Last name + community match exactly but the full name doesn't —
    // e.g. a spelling variant ("Michelle" vs "Michele") that survives
    // normalizeName()'s parenthetical-stripping. Never auto-matched:
    // always surfaced for human review, exactly like a phone match whose
    // name disagrees.
    if (client.normalizedLastName) {
      const bySurnameAndCommunity = residents.find(
        (r) =>
          r.normalizedLastName &&
          r.normalizedLastName === client.normalizedLastName &&
          r.communityName === client.communityName
      );
      if (bySurnameAndCommunity) {
        return {
          residentId: bySurnameAndCommunity.id,
          basis: "surname_and_community",
          requiresReview: true,
          reviewReason: `Last name and community match resident "${bySurnameAndCommunity.displayName}", but the full name ("${client.normalizedName}") does not exactly match — confirm whether this is a spelling or nickname variant of the same person before accepting.`,
        };
      }
    }
  }

  return { residentId: null, basis: "none", requiresReview: false, reviewReason: null };
}
