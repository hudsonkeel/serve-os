// Parses the Emergency Preparedness and Response Plan (EPRP) controlled
// procedure. Unlike the P&P, this document uses real Word heading styles
// (Heading1 for its 9 numbered sections, Heading2 for two sub-sections),
// confirmed during source validation — so structure is taken from styles,
// not forced into §558-style numbering the document doesn't itself use.
//
// Status handling is the point of this parser: the document explicitly
// identifies itself as "EPRP v0.3 - LEADERSHIP REVIEW DRAFT", states
// "Effective Date: Upon formal approval", "Last Annual Review: N/A -
// Initial Adoption", and "This EPRP becomes effective only after formal
// approval" (Section 9). None of that is inferred — it is quoted directly
// from the source. This parser must never upgrade that to "current" or
// "binding" just because it is the newest supplied file — see
// operationalAuthority below.
import { createHash } from "node:crypto";
import { parseDocxBodyParagraphs, readDocxPartText } from "./docxText.ts";
import { namespaceSectionNumber } from "./sectionNumbers.ts";
import type { ParsedDocument, ParsedSection } from "./types.ts";

const HEADING_NUMBER_RE = /^(\d+(?:\.\d+)?)\.?\s+(.+)$/;
const APPENDIX_RE = /appendix/i;
const DRAFT_BANNER_RE = /LEADERSHIP REVIEW DRAFT/i;
const EFFECTIVE_DATE_LABEL_RE = /^effective date$/i;

interface RawSection {
  sectionNumber: string;
  sectionTitle: string;
  sortOrder: number;
  lines: string[];
}

function cleanWhitespace(text: string): string {
  return text.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
}

export function parseEprpDocx(buffer: Buffer, sourcePath: string): ParsedDocument {
  const paragraphs = parseDocxBodyParagraphs(buffer);

  const sections: RawSection[] = [];
  const preamble: RawSection = { sectionNumber: "0", sectionTitle: "Document Control and Status", sortOrder: -1, lines: [] };
  let current: RawSection | null = null;
  let sawFirstHeading = false;
  let draftBannerFound = false;
  let effectiveDateValue: string | null = null;
  let pendingEffectiveDateLabel = false;

  for (const p of paragraphs) {
    const text = cleanWhitespace(p.text);
    if (text.length === 0) continue;

    if (DRAFT_BANNER_RE.test(text)) draftBannerFound = true;

    // The metadata table is label/value paragraph pairs (e.g. "Effective
    // Date" then "Upon formal approval") — captured for sourceMetadata
    // without trying to fully model the table.
    if (pendingEffectiveDateLabel) {
      effectiveDateValue = text;
      pendingEffectiveDateLabel = false;
    } else if (EFFECTIVE_DATE_LABEL_RE.test(text)) {
      pendingEffectiveDateLabel = true;
    }

    const isPrimaryHeading = p.style === "Heading1";
    const isSecondaryHeading = p.style === "Heading2" || (p.bold && APPENDIX_RE.test(text) && !p.style);

    if (isPrimaryHeading || isSecondaryHeading) {
      if (current) sections.push(current);
      else if (!sawFirstHeading && preamble.lines.length > 0) sections.push(preamble);
      sawFirstHeading = true;

      const numberMatch = text.match(HEADING_NUMBER_RE);
      current = numberMatch
        ? { sectionNumber: numberMatch[1], sectionTitle: cleanWhitespace(numberMatch[2]), sortOrder: p.index, lines: [] }
        : { sectionNumber: "appendix", sectionTitle: text, sortOrder: p.index, lines: [] };
      continue;
    }

    if (current) current.lines.push(text);
    else preamble.lines.push(text);
  }
  if (current) sections.push(current);

  const parsedSections: ParsedSection[] = sections
    .filter((s) => s.lines.join("").trim().length > 0)
    .map((s) => ({
      sectionNumber: namespaceSectionNumber("serve_controlled_procedure", s.sectionNumber),
      sectionTitle: s.sectionTitle,
      subsectionLabel: null,
      chunkIndex: 0,
      sortOrder: s.sortOrder,
      bodyText: s.lines.join("\n").trim(),
    }));

  const warnings: string[] = [];
  if (!draftBannerFound) {
    // Should never happen given the current source file, but this is
    // exactly the condition that must halt automatic status assignment
    // rather than silently defaulting to "current"/"binding" — see the
    // STOP CONDITIONS in the implementation brief.
    warnings.push(
      'No "LEADERSHIP REVIEW DRAFT" (or equivalent) status banner was found in this EPRP source. Refusing to assume draft status automatically — operationalAuthority defaulted to "pending_not_binding" and this MUST be manually confirmed before use.'
    );
  }

  const footerText = readDocxPartText(buffer, "word/footer1.xml");

  return {
    sourceType: "serve_controlled_procedure",
    title: "Emergency Preparedness and Response Plan (EPRP) — v0.3, Leadership Review Draft",
    sourceFilename: sourcePath.split(/[/\\]/).pop() ?? sourcePath,
    sourcePath,
    sourceStatus: "draft_pending_review",
    // Explicitly NOT "current_operating_policy" or "binding_regulation" —
    // the source states this plan "becomes effective only after formal
    // approval" and has never completed an annual review ("N/A - Initial
    // Adoption"). Being the newest supplied file does not change this.
    operationalAuthority: "pending_not_binding",
    // No effective date exists yet (pending approval) — recording the
    // file's own authoring/printed date as an effective date would falsely
    // imply the plan is in force. The authoring date is preserved in
    // sourceMetadata instead.
    effectiveOrUpdatedDate: null,
    // Current P&P §256 explicitly delegates emergency-preparedness detail
    // to this separately controlled EPRP ("The EPRP is maintained as a
    // separate controlled agency document and is incorporated into this
    // policy by reference.") — this is the deliberate, source-justified
    // link the task asked for, set once at the document level rather than
    // inferred per-subsection from this EPRP's own "Regulatory alignment:
    // §558.256(x)" annotations (which cite many different §558.256
    // subclauses, not a distinct section number each).
    relatedSectionNumber: "256",
    sourceMetadata: {
      footerText,
      statusBannerFound: draftBannerFound,
      effectiveDateFieldValue: effectiveDateValue,
    },
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    sections: parsedSections,
    warnings,
  };
}
