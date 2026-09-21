// Deterministic section-number handling — normalization, explicit-mention
// detection, and the P&P <-> Texas PAS cross-reference rule.
//
// Serve's P&P is organized by the same §558 section numbers as the Texas
// PAS regulations (confirmed during source validation: P&P "245 Staffing
// Hiring" <-> §558.245_TxReg_Staffing Policies.pdf, etc.), so a *bare*
// section number (e.g. "245") is the shared key between a serve_pnp
// section and a texas_pas section discussing the same requirement.
//
// The EPRP controlled procedure and the §558.255 Occupations Code cross-
// reference are deliberately NOT part of that bare-number namespace (see
// namespaceSectionNumber below) — their own internal numbering ("1", "4.1")
// or citation ("102.001") would otherwise collide with unrelated §558
// numbers (e.g. EPRP section "1" is not §558.1) and produce a false pair.
// Those two source types are linked to a P&P/Texas section only through
// their document-level relatedSectionNumber, set deliberately at ingestion
// time — never inferred from their own section numbering.

/** Strips a "§", "§558.", or "558." prefix and surrounding whitespace,
 *  leaving the bare number Serve's P&P and Texas PAS share (e.g. "245"). */
export function normalizeBareSectionNumber(raw: string): string {
  return raw
    .trim()
    .replace(/^§+\s*/, "")
    .replace(/^558\.\s*/, "")
    .replace(/\.$/, "")
    .trim();
}

/** Gives a source type its own numbering namespace so its section numbers
 *  can never be mistaken for (or accidentally paired against) a bare §558
 *  number. P&P and Texas PAS sections use the bare number directly. */
export function namespaceSectionNumber(sourceType: string, rawNumber: string): string {
  if (sourceType === "serve_pnp" || sourceType === "texas_pas") {
    return normalizeBareSectionNumber(rawNumber);
  }
  if (sourceType === "serve_controlled_procedure") {
    return `EPRP-${rawNumber.trim()}`;
  }
  if (sourceType === "texas_statute_cross_reference") {
    return `OCC-${normalizeBareSectionNumber(rawNumber)}`;
  }
  return rawNumber.trim();
}

// Matches an explicit, unambiguous section reference: "§558.245", "558.245",
// "§245", "section 245", "sec. 245". Deliberately does NOT match a bare
// number with no marker (e.g. "5 days", "12 months") — those are common in
// these source documents and are not section references, so treating any
// 2-3 digit number as a possible section number would produce false
// positives. A question with no explicit marker relies on text relevance
// instead (see textRelevance.ts), which is the realistic case for almost
// every natural-language operational question.
const EXPLICIT_REFERENCE_RE = /(?:§\s*(?:558\.)?|\bsec(?:tion)?\.?\s+)(\d{1,3})\b/gi;

/** Extracts bare section numbers explicitly referenced in free text
 *  (e.g. "what does §281 require" -> ["281"]). Order-preserving, deduped. */
export function extractExplicitSectionNumbers(text: string): string[] {
  const found: string[] = [];
  let match: RegExpExecArray | null;
  EXPLICIT_REFERENCE_RE.lastIndex = 0;
  while ((match = EXPLICIT_REFERENCE_RE.exec(text)) !== null) {
    const num = match[1];
    if (!found.includes(num)) found.push(num);
  }
  return found;
}
