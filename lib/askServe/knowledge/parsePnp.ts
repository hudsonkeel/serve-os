// Parses the Serve Caregiving Policies & Procedures .docx into ParsedSection
// records, using the document's own structure rather than arbitrary token
// chunking:
//   - Primary boundary: a bold paragraph beginning with a 2-3 digit number
//     (e.g. "245 Staffing Hiring") — the same §558-style numbering Texas
//     PAS uses, confirmed during source validation to be a reliable,
//     structural signal in this document (not a named Word heading style —
//     only 5/1105 paragraphs use one; the section numbers are plain bold
//     runs), not incidental formatting.
//   - Secondary boundary: any other non-empty bold paragraph encountered
//     after a primary heading (e.g. "Not Hirable" inside §245) — splits an
//     unusually large section into retrievable sub-chunks while preserving
//     the parent section number on every sub-chunk (ParsedSection.sectionNumber
//     stays the owning number; ParsedSection.subsectionLabel carries the
//     sub-heading).
import { createHash } from "node:crypto";
import { parseDocxBodyParagraphs, readDocxModifiedDate, readDocxPartText } from "./docxText.ts";
import { normalizeBareSectionNumber } from "./sectionNumbers.ts";
import type { ParsedDocument, ParsedSection } from "./types.ts";

const PRIMARY_HEADING_RE = /^(\d{2,3})[\s .]+(.+)$/;

interface RawChunk {
  sectionNumber: string;
  sectionTitle: string;
  subsectionLabel: string | null;
  chunkIndex: number;
  sortOrder: number;
  lines: string[];
  /** Identifies which numbered-heading occurrence this chunk belongs to.
   *  A section number normally has exactly one occurrence; two occurrences
   *  sharing a number (as §287 does) is the anomaly deduplication targets
   *  — see deduplicateChunks. Not related to chunkIndex, which restarts
   *  at 0 for every occurrence. */
  occurrenceId: number;
}

function cleanWhitespace(text: string): string {
  return text.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
}

function chunkPnpParagraphs(paragraphs: ReturnType<typeof parseDocxBodyParagraphs>): { chunks: RawChunk[]; warnings: string[] } {
  const chunks: RawChunk[] = [];
  const warnings: string[] = [];
  let current: RawChunk | null = null;
  let sawFirstPrimaryHeading = false;
  let chunkIndexWithinSection = 0;
  let occurrenceCounter = -1;
  let preambleParagraphs = 0;

  for (const p of paragraphs) {
    const text = cleanWhitespace(p.text);
    if (text.length === 0) continue;

    const primaryMatch = p.bold ? text.match(PRIMARY_HEADING_RE) : null;

    if (primaryMatch) {
      if (current) chunks.push(current);
      sawFirstPrimaryHeading = true;
      chunkIndexWithinSection = 0;
      occurrenceCounter += 1;
      current = {
        sectionNumber: normalizeBareSectionNumber(primaryMatch[1]),
        sectionTitle: cleanWhitespace(primaryMatch[2]),
        subsectionLabel: null,
        chunkIndex: 0,
        sortOrder: p.index,
        lines: [],
        occurrenceId: occurrenceCounter,
      };
      continue;
    }

    if (!sawFirstPrimaryHeading) {
      preambleParagraphs += 1;
      continue; // Content before the first numbered section — none expected; see warning below.
    }

    if (p.bold && current) {
      // Secondary (sub-heading) boundary within the current numbered section.
      chunks.push(current);
      chunkIndexWithinSection += 1;
      current = {
        sectionNumber: current.sectionNumber,
        sectionTitle: current.sectionTitle,
        subsectionLabel: text,
        chunkIndex: chunkIndexWithinSection,
        sortOrder: p.index,
        lines: [],
        occurrenceId: current.occurrenceId,
      };
      continue;
    }

    if (current) current.lines.push(text);
  }
  if (current) chunks.push(current);

  if (preambleParagraphs > 0) {
    warnings.push(
      `${preambleParagraphs} paragraph(s) of text appeared before the first numbered section heading and were not assigned to any section.`
    );
  }

  return { chunks, warnings };
}

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

/**
 * Detects a numbered section that occurs more than once in the document —
 * structurally unusual (every other §-number in this document occurs
 * exactly once) and exactly the shape of the known P&P §287 issue: "287
 * Client Satisfaction Survey Policy" is its own out-of-sequence top-level
 * heading, and its content is repeated, materially equivalent, inside the
 * correctly-ordered "287 Quality Assessment and Performance Improvement"
 * occurrence.
 *
 * Comparison is deliberately done per WHOLE OCCURRENCE (every chunk
 * between one primary heading and the next), not per matching sub-heading
 * label. An earlier version of this function compared same-named
 * sub-headings directly and produced false positives on §245, whose
 * "Lead Caregiver" and "Caregiver" job descriptions legitimately reuse
 * identical duty bullets ("Medication Reminders", "Pet Care", etc.) under
 * a single §245 occurrence — those are two different job listings, not a
 * duplicated section, and must never be silently merged. Comparing whole
 * occurrences (and only when a section number has more than one) avoids
 * that failure mode entirely: §245 has exactly one occurrence, so it is
 * never a candidate.
 *
 * A materially-equivalent pair is resolved by preferring the more
 * structurally developed occurrence (more sub-chunks — reflecting "the
 * properly organized QAPI location" the task calls for) over the thinner,
 * orphaned duplicate; the dropped occurrence is recorded in
 * warnings/metadata, never silently discarded without a trace. A pair
 * that does NOT clear the similarity threshold is left as-is — not
 * silently chosen between — and flagged for human review instead.
 */
function deduplicateChunks(chunks: RawChunk[]): { chunks: RawChunk[]; warnings: string[]; dedupeNotes: Record<string, unknown>[] } {
  const warnings: string[] = [];
  const dedupeNotes: Record<string, unknown>[] = [];

  const occurrencesByNumber = new Map<string, number[]>();
  for (const c of chunks) {
    const ids = occurrencesByNumber.get(c.sectionNumber) ?? [];
    if (!ids.includes(c.occurrenceId)) ids.push(c.occurrenceId);
    occurrencesByNumber.set(c.sectionNumber, ids);
  }

  const drop = new Set<RawChunk>();
  for (const [sectionNumber, occurrenceIds] of occurrencesByNumber) {
    if (occurrenceIds.length < 2) continue;

    for (let i = 0; i < occurrenceIds.length; i++) {
      for (let j = i + 1; j < occurrenceIds.length; j++) {
        const chunksA = chunks.filter((c) => c.occurrenceId === occurrenceIds[i]);
        const chunksB = chunks.filter((c) => c.occurrenceId === occurrenceIds[j]);
        // When an occurrence has been split into sub-chunks, its primary
        // chunk often serves as an introduction to a broader, differently-
        // themed topic (e.g. "Quality Assessment and Performance
        // Improvement" introducing the QAPI committee before its embedded
        // "Client Satisfaction Survey Policy" sub-chunks) rather than the
        // content that might duplicate something elsewhere. Comparing
        // whole occurrences directly dilutes a real duplicate's similarity
        // score with that unrelated intro text, so the comparable body
        // excludes an occurrence's own primary chunk whenever it has
        // sub-chunks to compare instead.
        const comparableBody = (group: RawChunk[]) => {
          const subChunks = group.filter((c) => c.chunkIndex > 0);
          const relevant = subChunks.length > 0 ? subChunks : group;
          return relevant.map((c) => c.lines.join(" ")).join(" ");
        };
        const similarity = jaccardSimilarity(comparableBody(chunksA), comparableBody(chunksB));

        const describe = (group: RawChunk[]) =>
          `§${sectionNumber} "${group[0].sectionTitle}" (${group.length} chunk(s), starting at document position ${group[0].sortOrder})`;

        if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
          // Prefer the more structurally developed occurrence (more
          // chunks); tie-break on later document position (assumed to be
          // the corrected/final placement).
          const keepA = chunksA.length !== chunksB.length ? chunksA.length > chunksB.length : chunksA[0].sortOrder > chunksB[0].sortOrder;
          const [keptChunks, droppedChunks] = keepA ? [chunksA, chunksB] : [chunksB, chunksA];
          for (const c of droppedChunks) drop.add(c);

          const note = `Duplicate section detected: §${sectionNumber} occurs twice in this document. ${describe(droppedChunks)} was dropped as a materially equivalent (similarity ${similarity.toFixed(2)}) duplicate of ${describe(keptChunks)}, which was kept.`;
          warnings.push(note);
          dedupeNotes.push({
            sectionNumber,
            kept: describe(keptChunks),
            dropped: describe(droppedChunks),
            similarity,
            resolution: "auto_deduplicated_materially_equivalent",
          });
        } else {
          const note = `§${sectionNumber} occurs twice in this document (${describe(chunksA)} and ${describe(chunksB)}) but content differs (similarity ${similarity.toFixed(2)}) — both retained; needs human review, not auto-merged.`;
          warnings.push(note);
          dedupeNotes.push({
            sectionNumber,
            occurrences: [describe(chunksA), describe(chunksB)],
            similarity,
            resolution: "not_auto_merged_needs_review",
          });
        }
      }
    }
  }

  return { chunks: chunks.filter((c) => !drop.has(c)), warnings, dedupeNotes };
}

export function parsePnpDocx(buffer: Buffer, sourcePath: string): ParsedDocument {
  const paragraphs = parseDocxBodyParagraphs(buffer);
  const { chunks: rawChunks, warnings: chunkingWarnings } = chunkPnpParagraphs(paragraphs);
  const { chunks: dedupedChunks, warnings: dedupeWarnings, dedupeNotes } = deduplicateChunks(rawChunks);

  const sections: ParsedSection[] = dedupedChunks
    .map((c) => ({
      sectionNumber: c.sectionNumber,
      sectionTitle: c.sectionTitle,
      subsectionLabel: c.subsectionLabel,
      chunkIndex: c.chunkIndex,
      sortOrder: c.sortOrder,
      bodyText: c.lines.join("\n").trim(),
    }))
    // A heading immediately followed by another heading (no body text in
    // between — e.g. §281's primary chunk, whose content lives entirely
    // in its "Initiation Service" sub-chunk) produces no evidence of its
    // own and would violate knowledge_sections' NOT-BLANK body_text
    // constraint if stored; dropped here rather than ingestion failing on
    // it later. The section number itself is not lost — it is still
    // carried by every surviving sub-chunk (see chunkPnpParagraphs).
    .filter((s) => s.bodyText.length > 0);

  const footerText = readDocxPartText(buffer, "word/footer1.xml");
  const modifiedIso = readDocxModifiedDate(buffer);

  // The footer's own "Updated: M/D/YYYY" line is the authoritative
  // currency signal for this document (validated during source review —
  // matches docProps' own modified timestamp). Fall back to the docProps
  // modified date if the footer line is ever absent or reworded.
  let effectiveOrUpdatedDate: string | null = null;
  const updatedMatch = footerText?.match(/Updated:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (updatedMatch) {
    const [, m, d, y] = updatedMatch;
    effectiveOrUpdatedDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  } else if (modifiedIso) {
    effectiveOrUpdatedDate = modifiedIso.slice(0, 10);
  }

  const warnings = [...chunkingWarnings, ...dedupeWarnings];

  return {
    sourceType: "serve_pnp",
    title: "Serve Caregiving Policies and Procedures",
    sourceFilename: sourcePath.split(/[/\\]/).pop() ?? sourcePath,
    sourcePath,
    // Per task instruction: this document carries no draft/pending marker
    // anywhere in its text, header, or footer (verified during source
    // validation) — its own revision history (footer: "Updated: 8/24/2026")
    // is the currency signal, and its absence of a draft marker is the
    // basis for source_status = "current". This is a fact about the
    // source, not an inference that it has undergone legal/executive
    // review — see operationalAuthority's own doc comment in types.ts.
    sourceStatus: "current",
    operationalAuthority: "current_operating_policy",
    effectiveOrUpdatedDate,
    relatedSectionNumber: null,
    sourceMetadata: {
      footerText,
      docxModifiedAt: modifiedIso,
      deduplication: dedupeNotes,
    },
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    sections,
    warnings,
  };
}
