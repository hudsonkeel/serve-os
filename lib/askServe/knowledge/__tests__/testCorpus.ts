// Shared test helper (not itself a *.test.ts) — loads the real, checked-in
// source corpus (Serve P&P, Texas PAS, EPRP) through the actual parsers
// and adapts it into the CorpusItem[] shape rankSections.ts consumes, so
// tests can exercise real retrieval ranking against real content without
// a database. Mirrors the adapter in lib/askServe/retrieval.ts, kept
// separate because that one adapts live Supabase rows, not ParsedDocument
// output directly.
import { readFile } from "node:fs/promises";
import { parsePnpDocx } from "../parsePnp.ts";
import { parseEprpDocx } from "../parseEprp.ts";
import { parseTexasPasCorpus } from "../parseTexasPas.ts";
import type { CorpusItem } from "../rankSections.ts";
import type { ParsedDocument } from "../types.ts";

const PNP_PATH = "docs/organizational-knowledge/policies/1.Serve Caregiving Policies & Procedures.docx";
const EPRP_PATH = "docs/organizational-knowledge/controlled-procedures/Serve_Caregiving_EPRP_v0.3_Leadership_Review_Draft.docx";
const REGULATIONS_DIR = "docs/organizational-knowledge/regulations/texas-pas";

let cachedCorpus: CorpusItem[] | null = null;

function documentToCorpusItems(doc: ParsedDocument): CorpusItem[] {
  return doc.sections.map((s, i) => ({
    sectionId: `${doc.sourcePath}#${s.sectionNumber}#${s.chunkIndex}#${i}`,
    documentId: doc.sourcePath,
    sourceType: doc.sourceType,
    sourceTitle: doc.title,
    sourceFilename: doc.sourceFilename,
    sourcePath: doc.sourcePath,
    sectionNumber: s.sectionNumber,
    sectionTitle: s.sectionTitle,
    subsectionLabel: s.subsectionLabel,
    bodyText: s.bodyText,
    sourceStatus: doc.sourceStatus,
    operationalAuthority: doc.operationalAuthority,
    effectiveOrUpdatedDate: doc.effectiveOrUpdatedDate,
  }));
}

/** Loads (and caches within a test process) the full real corpus. */
export async function loadRealCorpus(): Promise<CorpusItem[]> {
  if (cachedCorpus) return cachedCorpus;

  const [pnpBuffer, eprpBuffer, texas] = await Promise.all([
    readFile(PNP_PATH),
    readFile(EPRP_PATH),
    parseTexasPasCorpus(REGULATIONS_DIR),
  ]);

  const pnp = parsePnpDocx(pnpBuffer, PNP_PATH);
  const eprp = parseEprpDocx(eprpBuffer, EPRP_PATH);

  cachedCorpus = [pnp, eprp, ...texas.documents].flatMap(documentToCorpusItems);
  return cachedCorpus;
}
