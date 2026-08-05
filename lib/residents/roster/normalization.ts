// Pure normalization for the Watermere roster reconciliation engine — no
// I/O, fully unit-testable. Mirrors the conservative style established in
// scripts/importResidentSourceNotes/normalization.ts (trim/lowercase/
// collapse whitespace, never guess), adapted for full-population roster
// rows rather than free-text transcriptions.

export function normalizeUnit(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const trimmed = String(raw).trim();
  // Roster apartment numbers come through as bare numbers ("1201") or
  // occasionally with a leading zero/"Unit " prefix — strip anything
  // that isn't part of the identifying number itself.
  return trimmed.replace(/^unit\s+/i, "").replace(/^apt\.?\s*/i, "").trim();
}

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

// Splits "Bob & Pam" / "Bob and Pam" / "John/Evette" into two first
// names. A single name ("Janet") returns just itself. Never guesses a
// split point beyond these explicit separators — an unrecognized
// multi-word first-name field (e.g. "Mary Jane") is treated as one
// person's full first name, not a couple.
export function splitCoupleFirstNames(raw: string): readonly string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\s*(?:&|\/|\band\b)\s*/i).map((p) => p.trim()).filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [trimmed];
}

// True when `raw` looks like a real email address — used to distinguish
// the roster's "Email Address" column actually containing an email from
// it containing a free-text note like "6/8/26 Move In", which must never
// be treated as an email nor silently discarded.
export function looksLikeEmail(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}
