// Bounds and shapes retrieved evidence into what the model is actually
// shown. Two jobs: (1) keep the prompt a sane size (a raw §558.2
// Definitions excerpt alone is ~34,000 characters — every excerpt is
// capped, never silently, always with a visible truncation marker so the
// model knows not to treat a cut excerpt as complete), and (2) establish
// the exact, closed set of evidence ids citations may reference — the
// packet IS the validation boundary (see synthesize.ts's resolveCitations,
// which only ever trusts an id present in the packet it built).
import type { KnowledgeEvidence } from "../knowledge/types.ts";

const MAX_EVIDENCE_ITEMS = 14;
const MAX_EXCERPT_CHARS = 3000;

export interface EvidencePacketItem {
  evidenceId: string;
  sourceType: KnowledgeEvidence["citation"]["sourceType"];
  sourceTitle: string;
  sectionNumber: string;
  sectionTitle: string;
  subsectionLabel: string | null;
  sourceStatus: KnowledgeEvidence["citation"]["sourceStatus"];
  operationalAuthority: KnowledgeEvidence["citation"]["operationalAuthority"];
  excerpt: string;
}

export interface EvidencePacket {
  items: EvidencePacketItem[];
  /** True when items were dropped to stay under MAX_EVIDENCE_ITEMS — the
   *  prompt should say so, since the model must never present a partial
   *  evidence set as if it were exhaustive. */
  truncated: boolean;
}

function truncateExcerpt(text: string): string {
  if (text.length <= MAX_EXCERPT_CHARS) return text;
  return `${text.slice(0, MAX_EXCERPT_CHARS)}\n[...excerpt truncated for length — this source is longer than shown...]`;
}

/** Builds the bounded evidence packet from ranked retrieval results.
 *  Evidence is already ordered by rankKnowledgeEvidence's own priority
 *  (explicit match > text relevance > section context > cross-reference
 *  pair); this only caps the count, it never re-ranks. */
export function buildEvidencePacket(evidence: KnowledgeEvidence[]): EvidencePacket {
  const bounded = evidence.slice(0, MAX_EVIDENCE_ITEMS);

  const items: EvidencePacketItem[] = bounded.map((e) => ({
    evidenceId: e.citation.sectionId,
    sourceType: e.citation.sourceType,
    sourceTitle: e.citation.sourceTitle,
    sectionNumber: e.citation.sectionNumber,
    sectionTitle: e.citation.sectionTitle,
    subsectionLabel: e.citation.subsectionLabel,
    sourceStatus: e.citation.sourceStatus,
    operationalAuthority: e.citation.operationalAuthority,
    excerpt: truncateExcerpt(e.excerpt),
  }));

  return { items, truncated: evidence.length > MAX_EVIDENCE_ITEMS };
}
