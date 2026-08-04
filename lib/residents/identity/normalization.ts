// Pure normalization for the Resident Identity Resolution engine — no
// I/O, fully unit-testable. Reuses the same name/phone normalization
// already established in the roster reconciliation engine rather than
// duplicating it.
import { normalizeName as normalizeNamePart } from "../roster/normalization.ts";

export { normalizeName as normalizeNamePart, normalizePhone } from "../roster/normalization.ts";

export function normalizeFullName(firstName: string | null, lastName: string | null): string {
  return [normalizeNamePart(firstName), normalizeNamePart(lastName)].filter((p) => p.length > 0).join(" ");
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// The first whitespace-separated token of a (possibly compound) first
// name — "Marilyn Holstein" -> "marilyn". Used to recognize that a
// middle name embedded in the first-name field (a common cross-source
// formatting difference) doesn't make two records different people.
export function coreFirstNameToken(firstName: string | null): string {
  const normalized = normalizeNamePart(firstName);
  return normalized.split(" ")[0] ?? "";
}

// Splits a name into a token set on BOTH whitespace and hyphens, so
// "Nickell-Willson" and "Nickell Willson" compare identically — used for
// compound/hyphenated surname comparison.
export function nameTokenSet(name: string | null): ReadonlySet<string> {
  const normalized = normalizeNamePart(name);
  return new Set(normalized.split(/[\s-]+/).filter((t) => t.length > 0));
}

// True when `longerTokens` strictly contains every token of
// `shorterTokens` plus at least one more — e.g. {"marilyn"} inside
// {"marilyn","holstein"}. Deliberately NOT a fuzzy/partial match: every
// token of the shorter side must be present, and there must be a genuine
// size difference, or this returns false. Two names that merely share one
// token by coincidence (different core identities) do not qualify.
export function isStrictTokenSuperset(shorterTokens: ReadonlySet<string>, longerTokens: ReadonlySet<string>): boolean {
  if (shorterTokens.size === 0 || longerTokens.size <= shorterTokens.size) return false;
  for (const token of shorterTokens) {
    if (!longerTokens.has(token)) return false;
  }
  return true;
}
