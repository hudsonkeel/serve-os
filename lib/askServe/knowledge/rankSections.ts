// The shared evidence-ranking algorithm. Used by both the DB-backed
// retrieval path (lib/askServe/retrieval.ts, over sections Postgres has
// already returned) and this module's own unit tests (over the real
// source corpus parsed directly from the checked-in files, with no
// database involved) — see docs/architecture/ASK_SERVE_KNOWLEDGE_LAYER.md
// for why the DB-touching parts of this feature are live-verified instead
// of unit-mocked, matching this codebase's established convention.
import { extractExplicitSectionNumbers, normalizeBareSectionNumber } from "./sectionNumbers.ts";
import { computeInverseDocumentFrequency, normalizeScores, scoreRelevance, tokenize } from "./textRelevance.ts";
import type {
  KnowledgeCitation,
  KnowledgeEvidence,
  KnowledgeOperationalAuthority,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from "./types.ts";

/** Source-agnostic view of one retrievable section, decoupled from
 *  whether it came from a Postgres row or a freshly parsed document. */
export interface CorpusItem {
  sectionId: string;
  documentId: string;
  sourceType: KnowledgeSourceType;
  sourceTitle: string;
  sourceFilename: string;
  sourcePath: string;
  /** Already namespaced per sectionNumbers.ts (bare "245" for P&P/Texas
   *  PAS; "EPRP-4.1" / "OCC-102.001" for the other two source types). */
  sectionNumber: string;
  sectionTitle: string;
  subsectionLabel: string | null;
  bodyText: string;
  sourceStatus: KnowledgeSourceStatus;
  operationalAuthority: KnowledgeOperationalAuthority;
  effectiveOrUpdatedDate: string | null;
}

const DEFAULT_LIMIT = 6;
// A normalized-score floor below which a text-relevance match is noise,
// not evidence — keeps an unrelated section (e.g. "office WiFi password")
// from ever being returned just because a stray word overlaps.
const RELEVANCE_FLOOR = 0.15;

function toCitation(item: CorpusItem): KnowledgeCitation {
  return {
    documentId: item.documentId,
    sectionId: item.sectionId,
    sourceType: item.sourceType,
    sourceTitle: item.sourceTitle,
    sourceFilename: item.sourceFilename,
    sourcePath: item.sourcePath,
    sectionNumber: item.sectionNumber,
    sectionTitle: item.sectionTitle,
    subsectionLabel: item.subsectionLabel,
    sourceStatus: item.sourceStatus,
    operationalAuthority: item.operationalAuthority,
    effectiveOrUpdatedDate: item.effectiveOrUpdatedDate,
  };
}

function toEvidence(item: CorpusItem, matchReason: KnowledgeEvidence["matchReason"], score: number): KnowledgeEvidence {
  return {
    citation: toCitation(item),
    excerpt: item.bodyText,
    matchReason,
    score,
  };
}

/** True only for the two source types that share the bare §558 numbering
 *  namespace and may therefore be paired — see sectionNumbers.ts. */
function isPairable(sourceType: KnowledgeSourceType): boolean {
  return sourceType === "serve_pnp" || sourceType === "texas_pas";
}

/** Finds the cross-reference partner of an included P&P/Texas PAS item:
 *  the other source type's section with the identical bare section
 *  number, if one exists in the corpus. Never invents a pairing. Prefers
 *  a primary (no subsection label) chunk on the other side, but falls
 *  back to its first available chunk — a section's primary chunk is
 *  sometimes empty and dropped during parsing (e.g. P&P §281, whose
 *  content lives entirely in its "Initiation Service" sub-chunk), and
 *  that must not prevent pairing from being found at all. */
function findCrossReferencePair(item: CorpusItem, corpus: CorpusItem[]): CorpusItem | null {
  if (!isPairable(item.sourceType)) return null;
  const otherType: KnowledgeSourceType = item.sourceType === "serve_pnp" ? "texas_pas" : "serve_pnp";
  const candidates = corpus.filter((c) => c.sourceType === otherType && c.sectionNumber === item.sectionNumber);
  if (candidates.length === 0) return null;
  return candidates.find((c) => c.subsectionLabel === null) ?? candidates[0];
}

export interface RankOptions {
  limit?: number;
}

/**
 * Ranks a corpus of sections against a natural-language question.
 *
 * Two independent signals, combined (never blended into one number that
 * hides which source type produced a match — see KnowledgeEvidence.matchReason):
 *   1. Deterministic: an explicit "§245" / "section 245" style reference
 *      in the question directly selects that bare section number.
 *   2. Text relevance: term-overlap scoring (see textRelevance.ts) against
 *      every section's title/sub-heading/body.
 * Every included P&P or Texas PAS result is then paired with its
 * same-numbered counterpart in the other source, when one exists in the
 * corpus — this is the deterministic §558 cross-reference the P&P and
 * Texas PAS share. A pairing is only ever added when it is genuinely
 * present; an unmatched section is returned alone.
 */
export function rankKnowledgeEvidence(corpus: CorpusItem[], question: string, options: RankOptions = {}): KnowledgeEvidence[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const included = new Map<string, KnowledgeEvidence>();

  // 1. Explicit section-number references.
  const explicitNumbers = extractExplicitSectionNumbers(question).map(normalizeBareSectionNumber);
  for (const number of explicitNumbers) {
    for (const item of corpus) {
      if (isPairable(item.sourceType) && item.sectionNumber === number && item.subsectionLabel === null) {
        included.set(item.sectionId, toEvidence(item, "section_number_match", 1));
      }
    }
  }

  // 2. Text relevance, scored against every candidate not already matched
  //    explicitly. IDF-weighted over the corpus being ranked (see
  //    textRelevance.ts) — a term common to nearly every section (e.g.
  //    "office") must not by itself clear the relevance floor.
  const queryTokens = tokenize(question);
  const remaining = corpus.filter((item) => !included.has(item.sectionId));
  const weights = computeInverseDocumentFrequency(corpus.map((item) => [item.sectionTitle, item.subsectionLabel ?? "", item.bodyText].join(" ")));
  const rawScores = remaining.map((item) =>
    scoreRelevance(queryTokens, [item.sectionTitle, item.subsectionLabel ?? "", item.bodyText].join(" "), weights)
  );
  const normalized = normalizeScores(rawScores);

  const relevanceRanked = remaining
    .map((item, i) => ({ item, score: normalized[i] }))
    .filter(({ score }) => score >= RELEVANCE_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit - included.size));

  for (const { item, score } of relevanceRanked) {
    included.set(item.sectionId, toEvidence(item, "text_relevance", score));
  }

  // 3. Sibling sub-chunks of an already-matched, multi-part P&P/Texas PAS
  //    section. A large section is split into sub-chunks by topic (see
  //    parsePnp.ts) — e.g. P&P §281's "List of Services" (what a
  //    caregiver may do) and "Services Serve Does Not Provide" (what a
  //    caregiver may not do) are siblings. A question can share enough
  //    words with only one sibling to be individually relevance-matched
  //    while the other — equally necessary for a complete, safe answer —
  //    shares too few query terms to independently clear the relevance
  //    floor. Once any sub-chunk of a section is judged relevant, its
  //    siblings are included as supporting context, not as independent
  //    relevance matches (see matchReason "section_context" in types.ts).
  //    Only fires for a multi-chunk section (subsectionLabel !== null on
  //    the triggering match) — a single-chunk match has no siblings.
  //
  //    Bounded to sections with a small, coherent number of sub-chunks
  //    (<= MAX_SECTION_CONTEXT_SIBLINGS). Verified against the real
  //    ingested corpus: most multi-chunk P&P sections have 2-7 sub-
  //    chunks covering one topic's facets (§281: 5, §282: 6, §249: 7) —
  //    exactly the case this step exists for. §245 (Staffing/Hiring) is a
  //    structural outlier: 46 sub-chunks, because it's a container for
  //    several ENTIRE, separate job descriptions (Administrator, Lead
  //    Caregiver, Caregiver, Director of Operations), not topically
  //    adjacent facets of one policy. Without this bound, a single
  //    incidental §245 relevance match (e.g. "administrative duties" in
  //    an unrelated question) flooded every result with all 46 chunks —
  //    live-verified against the real database, not a theoretical
  //    concern. A section this large is better served by its individual
  //    sub-chunks winning on their own relevance than by all-or-nothing
  //    inclusion.
  const MAX_SECTION_CONTEXT_SIBLINGS = 10;
  const sectionContextKeys = new Set<string>();
  for (const evidence of Array.from(included.values())) {
    if (evidence.citation.subsectionLabel === null) continue;
    const key = `${evidence.citation.sourceType}::${evidence.citation.sectionNumber}`;
    sectionContextKeys.add(key);
  }
  for (const key of sectionContextKeys) {
    const [sourceType, sectionNumber] = key.split("::");
    const allMembers = corpus.filter((c) => c.sourceType === sourceType && c.sectionNumber === sectionNumber);
    if (allMembers.length > MAX_SECTION_CONTEXT_SIBLINGS) continue;
    const siblings = allMembers.filter((c) => !included.has(c.sectionId));
    for (const sibling of siblings) {
      included.set(sibling.sectionId, toEvidence(sibling, "section_context", 0));
    }
  }

  // 4. Deterministic cross-reference pairing, once per distinct
  //    (sourceType, sectionNumber) among included P&P/Texas PAS matches —
  //    not gated on the matched chunk being a section's primary chunk,
  //    since a section's primary chunk is sometimes empty and dropped
  //    during parsing (see findCrossReferencePair's own comment); gating
  //    on it would silently skip pairing for exactly those sections.
  //    Deduped by key so a large section matched via several sub-chunks
  //    only triggers one pairing lookup, not one per sub-chunk.
  const pairingAttempted = new Set<string>();
  for (const evidence of Array.from(included.values())) {
    const item = corpus.find((c) => c.sectionId === evidence.citation.sectionId);
    if (!item || !isPairable(item.sourceType)) continue;
    const key = `${item.sourceType}::${item.sectionNumber}`;
    if (pairingAttempted.has(key)) continue;
    pairingAttempted.add(key);

    const pair = findCrossReferencePair(item, corpus);
    if (pair && !included.has(pair.sectionId)) {
      included.set(pair.sectionId, toEvidence(pair, "cross_reference_pair", evidence.score));
    }
  }

  const REASON_RANK: Record<KnowledgeEvidence["matchReason"], number> = {
    section_number_match: 0,
    text_relevance: 1,
    section_context: 2,
    cross_reference_pair: 3,
  };
  return Array.from(included.values()).sort((a, b) => {
    const rankDiff = REASON_RANK[a.matchReason] - REASON_RANK[b.matchReason];
    if (rankDiff !== 0) return rankDiff;
    return b.score - a.score;
  });
}
