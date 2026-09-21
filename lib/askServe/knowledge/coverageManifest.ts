// Builds the source-coverage manifest ingestion produces: a record of
// every P&P <-> Texas PAS section-number gap, with an explicit reason —
// so a deliberate exclusion (Serve is PAS-only/non-medical; a regulatory-
// source availability condition) is never later mistaken for something
// ingestion silently missed. Computed from the actual parsed documents
// each run, not hand-maintained, so it stays accurate as the corpus
// changes — the specific business-context explanations below are the one
// exception, since "why" a gap is intentional is domain knowledge no
// parser can derive; any *newly appearing* gap this module doesn't
// already have an explanation for is still reported, just with a generic
// "needs review" reason instead of a silently-assumed one.
import type { ParsedDocument } from "./types.ts";

// Known, business-justified P&P <-> Texas PAS gaps as of the source
// corpus validated for this slice. See the Implementation Slice 1
// completion report for the source review these were confirmed against.
const KNOWN_GAP_EXPLANATIONS: Record<string, string> = {
  "297": 'No Texas PAS §558.297 (Receipt of Physician Orders) source PDF is in this corpus, and none is expected: Serve is PAS-only/non-medical and its P&P §297 is a clean non-applicability statement ("Serve Caregiving does not provide services requiring physician orders and Serve does not accept physician orders"). This is an intentional Serve operating boundary, not a missing source.',
  "302": 'No Texas PAS §558.302 (Pronouncement of Death) source PDF is in this corpus, and none is expected: Serve\'s P&P §302 is a clean non-applicability statement ("Serve Caregiving does not pronounce death under any circumstances"). This is an intentional Serve operating boundary, not a missing source.',
  "251": "No Texas PAS §558.251 (Peer Review) source PDF is in this corpus. This is a known regulatory-source availability/versioning condition (the current TAC viewer does not currently expose §558.251 as an individually downloadable rule, and current rulemaking activity adds a versioning wrinkle) — not fabricated, not treated as missing. Serve's P&P §251 (Peer Review Policy) remains retrievable as Serve policy on its own.",
};

export interface CoverageManifestEntry {
  sectionNumber: string;
  servePnpPresent: boolean;
  texasPasPresent: boolean;
  explanation: string | null;
}

export interface SourceCoverageManifest {
  generatedAt: string;
  documentCounts: Record<string, number>;
  sectionCounts: Record<string, number>;
  excludedFiles: { filename: string; reason: string }[];
  sectionNumberGaps: CoverageManifestEntry[];
  deduplicationNotes: Record<string, unknown>[];
  warnings: { sourcePath: string; sourceType: string; message: string }[];
}

export function buildSourceCoverageManifest(
  documents: ParsedDocument[],
  excludedFiles: { filename: string; reason: string }[]
): SourceCoverageManifest {
  const pnpNumbers = new Set(documents.filter((d) => d.sourceType === "serve_pnp").flatMap((d) => d.sections.map((s) => s.sectionNumber)));
  const texasNumbers = new Set(documents.filter((d) => d.sourceType === "texas_pas").flatMap((d) => d.sections.map((s) => s.sectionNumber)));

  const allNumbers = new Set([...pnpNumbers, ...texasNumbers]);
  const gaps: CoverageManifestEntry[] = [];
  for (const number of allNumbers) {
    const servePnpPresent = pnpNumbers.has(number);
    const texasPasPresent = texasNumbers.has(number);
    if (servePnpPresent && texasPasPresent) continue; // fully covered — not a gap.

    gaps.push({
      sectionNumber: number,
      servePnpPresent,
      texasPasPresent,
      explanation: KNOWN_GAP_EXPLANATIONS[number] ?? `§${number} exists in only one source (P&P: ${servePnpPresent}, Texas PAS: ${texasPasPresent}) with no recorded explanation — needs review.`,
    });
  }
  gaps.sort((a, b) => Number(a.sectionNumber) - Number(b.sectionNumber) || a.sectionNumber.localeCompare(b.sectionNumber));

  const documentCounts: Record<string, number> = {};
  const sectionCounts: Record<string, number> = {};
  for (const d of documents) {
    documentCounts[d.sourceType] = (documentCounts[d.sourceType] ?? 0) + 1;
    sectionCounts[d.sourceType] = (sectionCounts[d.sourceType] ?? 0) + d.sections.length;
  }

  const deduplicationNotes = documents.flatMap((d) => (Array.isArray(d.sourceMetadata.deduplication) ? (d.sourceMetadata.deduplication as Record<string, unknown>[]) : []));

  const warnings = documents.flatMap((d) => d.warnings.map((message) => ({ sourcePath: d.sourcePath, sourceType: d.sourceType, message })));

  return {
    generatedAt: new Date().toISOString(),
    documentCounts,
    sectionCounts,
    excludedFiles,
    sectionNumberGaps: gaps,
    deduplicationNotes,
    warnings,
  };
}
