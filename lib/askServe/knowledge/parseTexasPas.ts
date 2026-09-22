// Parses the Texas PAS regulation PDFs. One PDF = one knowledge section —
// confirmed during source validation that every individual §558.xxx PDF is
// already a single, complete, citation-bounded regulatory section (2-18
// pages), so no further chunking is applied even to the longest section
// (§558.2 Definitions) — splitting an already-well-bounded regulation
// would only fragment a citation that should be quoted whole.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { normalizeBareSectionNumber } from "./sectionNumbers.ts";
import type { ParsedDocument } from "./types.ts";

// Matches both filename shapes found in the corpus:
//   "§558.245_TxReg_Staffing Policies.pdf"
//   "§558.255_102.001_TxReg_Prohibition of Solicitation of Patients.pdf"
// The optional "_102.001" segment marks a cross-referenced statute (a
// citation the §558 section requires compliance with) filed alongside its
// parent section — never itself a §558 rule (see types.ts source types).
const FILENAME_RE = /^§558\.(\d+)(?:_(\d+\.\d+))?_TxReg_(.+)\.pdf$/i;
const COMBINED_MARKER = "(combined)";

interface ParsedFilename {
  bareSectionNumber: string;
  crossReferencedStatute: string | null;
  titleFromFilename: string;
}

export function parseTexasPasFilename(filename: string): ParsedFilename | null {
  const match = filename.match(FILENAME_RE);
  if (!match) return null;
  return {
    bareSectionNumber: normalizeBareSectionNumber(match[1]),
    crossReferencedStatute: match[2] ?? null,
    titleFromFilename: match[3].trim(),
  };
}

/** Extracts the "As in effect on M/D/YYYY" watermark every page of this
 *  corpus carries, as the regulation's own currency signal. */
function extractEffectiveDate(pdfText: string): string | null {
  const match = pdfText.match(/As in effect on (\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const [, m, d, y] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Extracts the regulation's own citation title line, e.g.
 *  "§558.245. Staffing Policies." -> "Staffing Policies". Falls back to
 *  the filename-derived title when the citation line isn't found (e.g.
 *  the Occupations Code cross-reference doesn't use §558 citation form). */
function extractCitationTitle(pdfText: string, bareSectionNumber: string, fallback: string): string {
  const escaped = bareSectionNumber.replace(/\./g, "\\.");
  const match = pdfText.match(new RegExp(`§558\\.${escaped}\\.\\s*([^.\\n]+)\\.`));
  return match ? match[1].trim() : fallback;
}

export async function parseTexasPasPdf(buffer: Buffer, sourcePath: string): Promise<ParsedDocument | null> {
  const filename = path.basename(sourcePath);
  const parsedName = parseTexasPasFilename(filename);
  if (!parsedName) return null;

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });

  const isCrossReference = parsedName.crossReferencedStatute !== null;
  const effectiveOrUpdatedDate = extractEffectiveDate(text);

  if (isCrossReference) {
    // e.g. Tex. Occ. Code §102.001 — filed under §558.255 but not itself a
    // §558 rule. Namespaced distinctly (see sectionNumbers.ts) so it can
    // never be mistaken for §558.255 itself or accidentally paired as if
    // it were the regulation.
    return {
      sourceType: "texas_statute_cross_reference",
      title: `Texas Occupations Code §${parsedName.crossReferencedStatute} (referenced by §558.${parsedName.bareSectionNumber})`,
      sourceFilename: filename,
      sourcePath,
      sourceStatus: "current",
      operationalAuthority: "supplementary_reference",
      effectiveOrUpdatedDate,
      relatedSectionNumber: parsedName.bareSectionNumber,
      sourceMetadata: { crossReferencedStatute: parsedName.crossReferencedStatute },
      contentHash: createHash("sha256").update(buffer).digest("hex"),
      sections: [
        {
          sectionNumber: `OCC-${parsedName.crossReferencedStatute}`,
          sectionTitle: parsedName.titleFromFilename,
          subsectionLabel: null,
          chunkIndex: 0,
          sortOrder: 0,
          bodyText: text.trim(),
        },
      ],
      warnings: [],
    };
  }

  const sectionTitle = extractCitationTitle(text, parsedName.bareSectionNumber, parsedName.titleFromFilename);

  return {
    sourceType: "texas_pas",
    title: `Texas Administrative Code Title 26 §558.${parsedName.bareSectionNumber}`,
    sourceFilename: filename,
    sourcePath,
    sourceStatus: "current",
    operationalAuthority: "binding_regulation",
    effectiveOrUpdatedDate,
    relatedSectionNumber: null,
    sourceMetadata: {},
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    sections: [
      {
        sectionNumber: parsedName.bareSectionNumber,
        sectionTitle,
        subsectionLabel: null,
        chunkIndex: 0,
        sortOrder: 0,
        bodyText: text.trim(),
      },
    ],
    warnings: [],
  };
}

export interface TexasPasCorpusResult {
  documents: ParsedDocument[];
  /** Files present in the directory but deliberately not ingested (the
   *  combined/omnibus PDF, and anything that doesn't match the expected
   *  filename shape) — recorded for the source-coverage manifest so an
   *  exclusion is never mistaken for something silently missed. */
  excluded: { filename: string; reason: string }[];
}

/** Parses every individual regulation PDF in a directory tree, excluding
 *  the combined/omnibus PDF (redundant with the split files — confirmed
 *  during source validation to be a straight concatenation). */
export async function parseTexasPasCorpus(directoryPath: string): Promise<TexasPasCorpusResult> {
  const documents: ParsedDocument[] = [];
  const excluded: TexasPasCorpusResult["excluded"] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".pdf")) continue;

      if (entry.name.includes(COMBINED_MARKER)) {
        excluded.push({ filename: entry.name, reason: "combined/omnibus PDF — redundant with individually split section PDFs" });
        continue;
      }

      const parsedName = parseTexasPasFilename(entry.name);
      if (!parsedName) {
        excluded.push({ filename: entry.name, reason: "filename does not match the expected §558.NNN_TxReg_Title.pdf shape" });
        continue;
      }

      const buffer = await readFile(fullPath);
      const relativePath = path.relative(process.cwd(), fullPath).split(path.sep).join("/");
      const doc = await parseTexasPasPdf(buffer, relativePath);
      if (doc) documents.push(doc);
    }
  }

  await walk(directoryPath);
  return { documents, excluded };
}
