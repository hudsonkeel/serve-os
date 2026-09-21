// Ask Serve's grounded-evidence retrieval — the only entry point the next
// slice (LLM answer synthesis) should call. Returns evidence, never a
// generated answer: exact source excerpts with full provenance, so
// interpretation can happen later without losing traceability back to a
// specific, inspectable source (see docs/architecture/ASK_SERVE_KNOWLEDGE_LAYER.md,
// "Retrieval trust rules").
//
// Ranking itself (text relevance + deterministic section-number matching
// and cross-reference pairing) lives in lib/askServe/knowledge/rankSections.ts,
// a pure module unit-tested directly against the real ingested corpus
// content (see lib/askServe/knowledge/__tests__/knowledgeQuestions.test.ts).
// This file's own job is I/O: fetch candidates from Supabase, adapt them
// into the shape that pure module expects, and hand back its result.
// Following this codebase's established convention (see the header
// comment in lib/data/knowledgeDocuments.ts), that I/O orchestration is
// live-verified (scripts/verify-ask-serve-knowledge-retrieval.ts) rather
// than unit-mocked.
//
// Why fetch-all-then-rank-in-process, given knowledge_sections has a real
// Postgres full-text-search column (search_vector, GIN-indexed)? The v0.1
// corpus is small (~120 rows total across all four source types) — cheap
// to fetch in full and rank deterministically with the same tested logic
// this feature's tests exercise. searchKnowledgeSectionsByText (real
// websearch_to_tsquery FTS) is implemented and available in
// lib/data/knowledgeSections.ts for when corpus size stops making
// fetch-all reasonable; wiring it in as the primary candidate-narrowing
// step is expected future work, not a gap being hidden here.
import { listAllKnowledgeSectionsWithDocuments } from "../data/knowledgeSections.ts";
import { rankKnowledgeEvidence, type CorpusItem } from "./knowledge/rankSections.ts";
import type { KnowledgeEvidence, KnowledgeSectionWithDocument } from "./knowledge/types.ts";

function toCorpusItem(row: KnowledgeSectionWithDocument): CorpusItem {
  return {
    sectionId: row.id,
    documentId: row.document_id,
    sourceType: row.document.source_type,
    sourceTitle: row.document.title,
    sourceFilename: row.document.source_filename,
    sourcePath: row.document.source_path,
    sectionNumber: row.section_number,
    sectionTitle: row.section_title,
    subsectionLabel: row.subsection_label,
    bodyText: row.body_text,
    sourceStatus: row.document.source_status,
    operationalAuthority: row.document.operational_authority,
    effectiveOrUpdatedDate: row.document.effective_or_updated_date,
  };
}

export interface RetrieveKnowledgeEvidenceOptions {
  limit?: number;
}

/**
 * Retrieves grounded evidence for a natural-language Serve operations
 * question from Serve P&P, Texas PAS, and (where its status permits) the
 * EPRP controlled procedure.
 *
 * Never returns a synthesized answer. Never filters out non-binding
 * evidence (e.g. the EPRP) — it returns it, honestly labeled via
 * citation.sourceStatus / citation.operationalAuthority, so the caller can
 * decide how to present it. Never fabricates a citation for a section
 * number that doesn't exist in the corpus (cross-reference pairing only
 * adds a pair when one is actually found — see rankSections.ts). Returns
 * an empty array, not an invented answer, when nothing in the corpus is
 * relevant — e.g. an out-of-scope question.
 */
export async function retrieveKnowledgeEvidence(
  question: string,
  options: RetrieveKnowledgeEvidenceOptions = {}
): Promise<KnowledgeEvidence[]> {
  const rows = await listAllKnowledgeSectionsWithDocuments();
  const corpus = rows.map(toCorpusItem);
  return rankKnowledgeEvidence(corpus, question, options);
}
