// The one canonical phone utility used by every resident-creation path
// (scripts/importWatermereRoster.ts, convert_external_prospect_to_new_resident's
// caller, ...). Deliberately STRICT, unlike
// lib/residents/roster/normalization.ts's normalizePhone, which stays as
// the loose digit-strip-only comparator used for identity/household
// SIGNAL matching (where "same digits" is the right question, not
// "is this a valid US number"). Never guesses or pads a missing digit —
// an invalid value is preserved as raw and never written to `phone`.

export interface PhoneValidationResult {
  readonly normalized: string | null;
  readonly valid: boolean;
}

// No phone provided at all is not a malformed-phone issue — absence is
// fine; only a present-but-invalid value is.
export function validatePhoneForStorage(raw: string | null | undefined): PhoneValidationResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { normalized: null, valid: true };

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) {
    return { normalized: digits, valid: true };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return { normalized: digits.slice(1), valid: true };
  }
  return { normalized: null, valid: false };
}
