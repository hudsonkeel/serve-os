// Pure validation/normalization for External Client conversion forms and
// the External Prospect expected service location. Kept separate from
// lib/actions/externalClients.ts and lib/actions/relationships.ts so it
// can be unit tested without a database — mirrors
// lib/relationships/validation.ts.

export interface NormalizeTextResult {
  value?: string;
  error?: string;
}

export function normalizeRequiredName(raw: string, label: string): NormalizeTextResult {
  const value = raw.trim();
  if (!value) {
    return { error: `Enter a ${label}.` };
  }
  return { value };
}

// 50 states + DC + the inhabited territories a Watermere/Serve family
// contact could plausibly list — a plain, hand-maintained list rather
// than a package dependency, matching this app's existing convention of
// not reaching for a library for a small controlled-value set.
export const US_STATE_ABBREVIATIONS: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY", "PR", "VI", "GU",
];

export function isValidUsState(value: string): boolean {
  return US_STATE_ABBREVIATIONS.includes(value.trim().toUpperCase());
}

// Accepts 5-digit or ZIP+4 (12345 or 12345-6789) — the two formats a
// postal address form realistically needs to accept.
const ZIP_CODE_PATTERN = /^\d{5}(-\d{4})?$/;

export function isValidZipCode(value: string): boolean {
  return ZIP_CODE_PATTERN.test(value.trim());
}

export interface ServiceAddressInput {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface ServiceAddressResult {
  value?: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    postalCode: string;
  };
  error?: string;
}

// Part 15 (External Prospect domain model) / Part 21 (External Client
// activation): a complete, plausible service address is required both to
// create an External Prospect and to activate an External Client — this
// is Serve's one shared validator for "is this a real service address,"
// covering blank fields, an unrecognized state abbreviation, and an
// implausible ZIP format.
export function validateServiceAddress(input: ServiceAddressInput): ServiceAddressResult {
  const addressLine1 = input.addressLine1.trim();
  const addressLine2 = input.addressLine2?.trim() || null;
  const city = input.city.trim();
  const state = input.state.trim().toUpperCase();
  const postalCode = input.postalCode.trim();

  if (!addressLine1 || !city || !state || !postalCode) {
    return { error: "Enter a complete service address (street, city, state, and postal code)." };
  }

  if (!isValidUsState(state)) {
    return { error: "Enter a valid two-letter state abbreviation (e.g. TX)." };
  }

  if (!isValidZipCode(postalCode)) {
    return { error: "Enter a valid ZIP code (e.g. 75034 or 75034-1234)." };
  }

  return { value: { addressLine1, addressLine2, city, state, postalCode } };
}

export function normalizeOptionalText(raw: string | undefined): string | null {
  return raw?.trim() || null;
}
