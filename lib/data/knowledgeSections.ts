// Data layer for knowledge_sections. I/O only — see the file header in
// lib/data/knowledgeDocuments.ts for why this is live-verified rather
// than unit-mocked.
import { createServerClient } from "../supabase/server.ts";
import type { KnowledgeSectionRow, KnowledgeSectionWithDocument } from "../askServe/knowledge/types.ts";

const SELECT_WITH_DOCUMENT = "*, document:knowledge_documents(*)";

/** Fetches every knowledge_sections row with its parent document. The v0.1
 *  corpus is small (~120 rows) — fetching all of it and ranking in
 *  process (lib/askServe/knowledge/rankSections.ts) is a deliberate,
 *  documented choice, not an oversight; see
 *  docs/architecture/ASK_SERVE_KNOWLEDGE_LAYER.md. */
export async function listAllKnowledgeSectionsWithDocuments(): Promise<KnowledgeSectionWithDocument[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("knowledge_sections").select(SELECT_WITH_DOCUMENT).order("section_number").order("chunk_index");

  if (error) {
    console.error("[listAllKnowledgeSectionsWithDocuments]", { message: error.message });
    return [];
  }

  return (data as unknown as KnowledgeSectionWithDocument[] | null) ?? [];
}

/** Postgres full-text search over knowledge_sections.search_vector
 *  (tsvector + GIN, see the migration). This is the real FTS candidate
 *  path; lib/askServe/retrieval.ts additionally applies the shared, unit-
 *  tested ranking module (rankSections.ts) to the small corpus this
 *  query — and listAllKnowledgeSectionsWithDocuments as a fallback —
 *  return, rather than relying on FTS ranking alone. */
export async function searchKnowledgeSectionsByText(query: string, limit: number = 20): Promise<KnowledgeSectionWithDocument[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("knowledge_sections")
    .select(SELECT_WITH_DOCUMENT)
    .textSearch("search_vector", query, { type: "websearch", config: "english" })
    .limit(limit);

  if (error) {
    // A malformed websearch query (e.g. unbalanced quotes) is a normal,
    // expected outcome of passing raw user text straight through — not a
    // system failure. The caller falls back to the full in-process
    // ranking pass in that case.
    console.warn("[searchKnowledgeSectionsByText] falling back to full ranking", { query, message: error.message });
    return [];
  }

  return (data as unknown as KnowledgeSectionWithDocument[] | null) ?? [];
}

/** Every section (across every source type) sharing one bare §558 section
 *  number — the deterministic P&P <-> Texas PAS cross-reference lookup. */
export async function getKnowledgeSectionsByNumber(sectionNumber: string): Promise<KnowledgeSectionWithDocument[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("knowledge_sections").select(SELECT_WITH_DOCUMENT).eq("section_number", sectionNumber);

  if (error) {
    console.error("[getKnowledgeSectionsByNumber]", { sectionNumber, message: error.message });
    return [];
  }

  return (data as unknown as KnowledgeSectionWithDocument[] | null) ?? [];
}

export async function deleteKnowledgeSectionsForDocument(documentId: string): Promise<{ error?: string }> {
  const supabase = createServerClient();

  const { error } = await supabase.from("knowledge_sections").delete().eq("document_id", documentId);

  if (error) {
    return { error: `Could not delete existing sections: ${error.message}` };
  }
  return {};
}

export interface InsertKnowledgeSectionInput {
  documentId: string;
  sectionNumber: string;
  sectionTitle: string;
  subsectionLabel: string | null;
  chunkIndex: number;
  sortOrder: number;
  bodyText: string;
}

/** Bulk insert for one document's freshly parsed sections. The ingestion
 *  script always deletes a document's prior sections first (see
 *  deleteKnowledgeSectionsForDocument) and re-inserts, rather than
 *  attempting a per-row diff — simplest correct behavior for a small,
 *  wholesale-re-parsed corpus; the *document* row (and its content_hash)
 *  is what ingestion uses to decide whether re-parsing was needed at all. */
export async function insertKnowledgeSections(inputs: InsertKnowledgeSectionInput[]): Promise<{ inserted: number; error?: string }> {
  if (inputs.length === 0) return { inserted: 0 };
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("knowledge_sections")
    .insert(
      inputs.map((s) => ({
        document_id: s.documentId,
        section_number: s.sectionNumber,
        section_title: s.sectionTitle,
        subsection_label: s.subsectionLabel,
        chunk_index: s.chunkIndex,
        sort_order: s.sortOrder,
        body_text: s.bodyText,
      }))
    )
    .select("id");

  if (error) {
    return { inserted: 0, error: `Could not insert sections: ${error.message}` };
  }

  return { inserted: (data as { id: string }[] | null)?.length ?? 0 };
}

export type { KnowledgeSectionRow };
