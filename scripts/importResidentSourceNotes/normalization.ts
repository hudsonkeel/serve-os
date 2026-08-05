// Pure name/unit normalization — no I/O, fully unit-testable. See
// scripts/importResidentSourceNotes.ts for how this feeds matching.ts.

export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

export interface ParsedNameParts {
  // True when the source only gives an initial for the first name
  // ("E. Goldberg") rather than a full first name.
  readonly isInitialForm: boolean;
  readonly firstToken: string; // normalized — either a full first name or a single initial
  readonly lastName: string; // normalized
}

// Splits "E. Goldberg" -> { isInitialForm: true, firstToken: "e", lastName: "goldberg" }
// and "Jerald Maxwell" -> { isInitialForm: false, firstToken: "jerald", lastName: "maxwell" }.
// Assumes exactly two space-separated tokens — every source name transcribed
// for this import fits that shape; a name with more tokens takes the last
// token as the surname and joins the rest as the first-name field, which is
// still a reasonable, conservative default.
export function parseNameParts(raw: string): ParsedNameParts {
  const normalized = normalizeName(raw);
  const tokens = normalized.split(" ").filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return { isInitialForm: false, firstToken: "", lastName: "" };
  }
  if (tokens.length === 1) {
    return { isInitialForm: false, firstToken: "", lastName: tokens[0] };
  }

  const lastName = tokens[tokens.length - 1];
  const firstPart = tokens.slice(0, -1).join(" ");
  const isInitialForm = firstPart.length === 1;

  return { isInitialForm, firstToken: firstPart, lastName };
}

// True when `content` already mentions the concept behind `need`, judged
// by a bounded set of keyword variants per need — deliberately simple
// (substring, case-insensitive) rather than fuzzy/semantic matching, so
// its behavior is always predictable and auditable in a preview.
export function containsKeyword(content: string, keywords: readonly string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}
