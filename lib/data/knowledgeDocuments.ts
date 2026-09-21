// Data layer for knowledge_documents (Ask Serve's knowledge foundation).
// See supabase/migrations/20260920000000_create_ask_serve_knowledge_layer.sql
// and docs/architecture/ASK_SERVE_KNOWLEDGE_LAYER.md.
//
// This file is I/O only (Supabase queries) — per this codebase's
// established convention (see lib/compliance/__tests__/auditReadinessDashboard.test.ts's
// own comment), data/orchestration layers like this one are live-verified
// against a real database (scripts/verify-ask-serve-knowledge-retrieval.ts),
// not unit-mocked. The logic worth unit-testing (parsing, ranking,
// section-number matching) is pulled out into pure modules under
// lib/askServe/knowledge/ instead.
import { createServerClient } from "../supabase/server.ts";
import type { KnowledgeDocumentRow } from "../askServe/knowledge/types.ts";

export async function getKnowledgeDocumentByPath(sourcePath: string): Promise<KnowledgeDocumentRow | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("knowledge_documents").select("*").eq("source_path", sourcePath).maybeSingle();

  if (error) {
    console.error("[getKnowledgeDocumentByPath]", { sourcePath, message: error.message });
    return null;
  }

  return (data as KnowledgeDocumentRow | null) ?? null;
}

export async function listKnowledgeDocuments(): Promise<KnowledgeDocumentRow[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.from("knowledge_documents").select("*").order("source_type").order("source_path");

  if (error) {
    console.error("[listKnowledgeDocuments]", { message: error.message });
    return [];
  }

  return (data as KnowledgeDocumentRow[] | null) ?? [];
}

export interface UpsertKnowledgeDocumentInput {
  sourceType: KnowledgeDocumentRow["source_type"];
  title: string;
  sourceFilename: string;
  sourcePath: string;
  sourceStatus: KnowledgeDocumentRow["source_status"];
  operationalAuthority: KnowledgeDocumentRow["operational_authority"];
  effectiveOrUpdatedDate: string | null;
  relatedSectionNumber: string | null;
  sourceMetadata: Record<string, unknown>;
  contentHash: string;
}

/** Idempotent upsert keyed on source_path (unique) — re-ingesting the same
 *  file updates the row in place rather than creating a duplicate. Caller
 *  (the ingestion script) is responsible for comparing content_hash first
 *  and deciding whether a changed hash should instead go through
 *  supersedeKnowledgeDocument. */
export async function upsertKnowledgeDocument(input: UpsertKnowledgeDocumentInput): Promise<{ document?: KnowledgeDocumentRow; error?: string }> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("knowledge_documents")
    .upsert(
      {
        source_type: input.sourceType,
        title: input.title,
        source_filename: input.sourceFilename,
        source_path: input.sourcePath,
        source_status: input.sourceStatus,
        operational_authority: input.operationalAuthority,
        effective_or_updated_date: input.effectiveOrUpdatedDate,
        related_section_number: input.relatedSectionNumber,
        source_metadata: input.sourceMetadata,
        content_hash: input.contentHash,
        ingested_at: new Date().toISOString(),
      },
      { onConflict: "source_path" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return { error: `Could not upsert knowledge document: ${error?.message}` };
  }

  return { document: data as KnowledgeDocumentRow };
}
