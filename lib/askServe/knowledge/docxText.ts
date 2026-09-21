// Pure text/structure extraction from a Word document's word/document.xml
// (already decompressed by docxZip.ts). Deliberately does not attempt to
// be a general OOXML parser — it extracts exactly what the P&P and EPRP
// source documents need for reliable chunking: paragraph text, whether the
// paragraph is entirely bold-run (the real structural signal this
// codebase's source documents use for section/sub-section headings — see
// docs/architecture/ASK_SERVE_KNOWLEDGE_LAYER.md), and any named paragraph
// style (e.g. Word's built-in "Heading1"/"Heading2", used by the EPRP).
import { readZipEntry } from "./docxZip.ts";

export interface DocxParagraph {
  index: number;
  text: string;
  /** True only when every text run in the paragraph is bold — matches how
   *  Word represents a manually-bolded heading line in these source docs. */
  bold: boolean;
  /** Named paragraph style (e.g. "Heading1"), or null if unstyled/"Normal". */
  style: string | null;
}

const PARAGRAPH_RE = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
const RUN_RE = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
const TEXT_RE = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const STYLE_RE = /<w:pStyle\s+w:val="([^"]+)"/;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function runIsBold(runXml: string): boolean {
  // A run is bold when its run-properties block (<w:rPr>) contains <w:b/>
  // or <w:b w:val="..."/> without an explicit false value.
  const rPrMatch = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  if (!rPrMatch) return false;
  const bMatch = rPrMatch[1].match(/<w:b(\s[^/]*)?\/>/);
  if (!bMatch) return false;
  const valMatch = bMatch[1]?.match(/w:val="([^"]+)"/);
  if (!valMatch) return true; // <w:b/> with no val defaults to true.
  return valMatch[1] !== "false" && valMatch[1] !== "0";
}

function runHasText(runXml: string): boolean {
  return /<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/.test(runXml);
}

/** Parses a document.xml buffer into an ordered list of paragraphs. */
export function parseDocxParagraphs(documentXml: Buffer | string): DocxParagraph[] {
  const xml = typeof documentXml === "string" ? documentXml : documentXml.toString("utf8");
  const paragraphs: DocxParagraph[] = [];

  let pMatch: RegExpExecArray | null;
  let index = 0;
  PARAGRAPH_RE.lastIndex = 0;
  while ((pMatch = PARAGRAPH_RE.exec(xml)) !== null) {
    const pXml = pMatch[1];

    const styleMatch = pXml.match(STYLE_RE);
    const style = styleMatch ? styleMatch[1] : null;

    let text = "";
    let runsWithText = 0;
    let boldRunsWithText = 0;

    let rMatch: RegExpExecArray | null;
    RUN_RE.lastIndex = 0;
    while ((rMatch = RUN_RE.exec(pXml)) !== null) {
      const runXml = rMatch[1];
      let tMatch: RegExpExecArray | null;
      TEXT_RE.lastIndex = 0;
      let runText = "";
      while ((tMatch = TEXT_RE.exec(runXml)) !== null) {
        runText += tMatch[1];
      }
      if (runText.length > 0) {
        text += runText;
        runsWithText += 1;
        if (runIsBold(runXml)) boldRunsWithText += 1;
      } else if (runHasText(runXml)) {
        // Defensive: a <w:t/> with no captured group content (shouldn't
        // happen given TEXT_RE, but keeps bold accounting honest).
        runsWithText += 1;
      }
    }

    paragraphs.push({
      index,
      text,
      bold: runsWithText > 0 && boldRunsWithText === runsWithText,
      style,
    });
    index += 1;
  }

  return paragraphs.map((p) => ({ ...p, text: decodeXmlEntities(p.text) }));
}

/** Reads and parses the body paragraphs directly from a .docx file buffer. */
export function parseDocxBodyParagraphs(docxBuffer: Buffer): DocxParagraph[] {
  const documentXml = readZipEntry(docxBuffer, "word/document.xml");
  return parseDocxParagraphs(documentXml);
}

/** Reads a header/footer part (e.g. "word/footer1.xml") as plain text, for
 *  provenance metadata (revision-date lines, draft-status banners, etc.). */
export function readDocxPartText(docxBuffer: Buffer, partName: string): string | null {
  try {
    const xml = readZipEntry(docxBuffer, partName);
    return parseDocxParagraphs(xml)
      .map((p) => p.text)
      .join(" ")
      .trim();
  } catch {
    return null;
  }
}

/** Reads docProps/core.xml's dcterms:modified value, if present. */
export function readDocxModifiedDate(docxBuffer: Buffer): string | null {
  try {
    const xml = readZipEntry(docxBuffer, "docProps/core.xml").toString("utf8");
    const match = xml.match(/<dcterms:modified[^>]*>([^<]+)<\/dcterms:modified>/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
