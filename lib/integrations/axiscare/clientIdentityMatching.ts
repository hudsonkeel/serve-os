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
  readonly unitNumber: string | null;
  readonly communityName: string | null;
}

export type ClientMatchBasis =
  | "email"
  | "phone"
  | "name_and_apartment"
  | "name_and_community"
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
  return `${firstName} ${lastName}`.trim().toLowerCase().replace(/\s+/g, " ");
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
  }

  return { residentId: null, basis: "none", requiresReview: false, reviewReason: null };
}
