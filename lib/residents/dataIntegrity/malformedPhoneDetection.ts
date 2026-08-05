// malformed_phone detection — a present-but-invalid phone value. Never
// flags a genuinely absent phone (that's just missing data, not malformed
// data). Pure, no I/O.
import { validatePhoneForStorage } from "./phoneNormalization.ts";
import type { IntegrityEvidenceSignal } from "./types.ts";

export function detectMalformedPhone(rawPhone: string | null): IntegrityEvidenceSignal[] {
  const trimmed = (rawPhone ?? "").trim();
  if (!trimmed) return [];

  const { valid } = validatePhoneForStorage(rawPhone);
  if (valid) return [];

  const digitCount = trimmed.replace(/\D/g, "").length;
  return [
    {
      signalType: "invalid_phone_length_or_format",
      description: `Source phone value "${trimmed}" has ${digitCount} digit(s) — not a valid 10-digit US number or an 11-digit number with a leading country code. Never guessed or padded; the raw value is preserved and the phone field is left blank.`,
      rawValue: trimmed,
      normalizedValue: null,
    },
  ];
}
