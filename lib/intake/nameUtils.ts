// Pure name-splitting for intake sources that collect one combined "name"
// field rather than separate first/last (the current family-consultation
// and professional-referral website forms both do this — see
// docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md, "Field mapping
// inventory"). Deterministic but intentionally simple: first word is the
// first name, everything else is the last name. Imperfect for
// multi-word first names ("Mary Ann Smith" -> first "Mary", last
// "Ann Smith") — documented, not silently masked, since inventing a
// smarter heuristic risks guessing wrong more often than this simple rule.
export interface SplitName {
  firstName: string | null;
  lastName: string | null;
}

export function splitFullName(raw: string | null | undefined): SplitName {
  const trimmed = raw?.trim();
  if (!trimmed) return { firstName: null, lastName: null };

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function joinName(firstName: string | null, lastName: string | null): string | null {
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return joined || null;
}
