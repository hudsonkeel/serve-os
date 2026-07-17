// Pure validation/normalization for External Client conversion forms. Kept
// separate from lib/actions/externalClients.ts so it can be unit tested
// without a database — mirrors lib/relationships/validation.ts.

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

export interface ServiceAddressInput {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface ServiceAddressResult {
  value?: {
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  error?: string;
}

// Part 21: "external-client activation without required service address"
// must be prevented — activation cannot proceed with a blank line 1,
// city, state, or postal code, since traditional home-care service can't
// be scheduled without knowing where to go.
export function validateServiceAddress(input: ServiceAddressInput): ServiceAddressResult {
  const addressLine1 = input.addressLine1.trim();
  const city = input.city.trim();
  const state = input.state.trim();
  const postalCode = input.postalCode.trim();

  if (!addressLine1 || !city || !state || !postalCode) {
    return { error: "Enter a complete service address (street, city, state, and postal code)." };
  }

  return { value: { addressLine1, city, state, postalCode } };
}

export function normalizeOptionalText(raw: string | undefined): string | null {
  return raw?.trim() || null;
}
