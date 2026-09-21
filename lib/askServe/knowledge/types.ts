// Shared types for the Ask Serve knowledge foundation: parsing (pre-DB),
// the DB row shapes ingestion writes, and the evidence shape retrieval
// returns. See docs/architecture/ASK_SERVE_KNOWLEDGE_LAYER.md.

/** What kind of source a document is. Drives how it may be cited and
 *  whether it can be paired with a matching section from another source. */
export type KnowledgeSourceType =
  | "serve_pnp" // Serve Caregiving Policies & Procedures (the operating P&P manual).
  | "texas_pas" // An individual Texas Administrative Code §558 section.
  | "texas_statute_cross_reference" // A statute a §558 section references (e.g. Tex. Occ. Code Ch. 102), not itself a §558 rule.
  | "serve_controlled_procedure"; // A separately controlled Serve procedure a P&P section delegates to (e.g. the EPRP).

/** The document's own lifecycle/revision state, independent of whether it
 *  is currently treated as authoritative — see operationalAuthority. */
export type KnowledgeSourceStatus =
  | "current" // Latest known version; no draft/pending marker found in the source itself.
  | "draft_pending_review" // The source document itself states it is a draft awaiting approval.
  | "superseded"; // Retained for provenance; a newer document row has replaced it.

/** What Ask Serve is allowed to treat a document as. Deliberately a
 *  separate axis from sourceStatus — a document can be the current,
 *  actively-maintained copy of something (sourceStatus = "current") while
 *  still being explicitly non-binding pending approval (see the EPRP). */
export type KnowledgeOperationalAuthority =
  | "current_operating_policy" // Serve P&P: Serve's current operating policy, as evidenced by the source (no claim of legal/executive review).
  | "binding_regulation" // Texas §558 regulation text, current law.
  | "supplementary_reference" // A cross-referenced statute — supporting context, not independently binding.
  | "pending_not_binding"; // Explicitly draft/under review per the source itself — must never be presented as adopted policy.

// ───────────────────────── Parsing (pre-DB) ─────────────────────────────

export interface ParsedSection {
  /** Bare section number in this document's own numbering (e.g. "245" for
   *  P&P/TX PAS, "EPRP-4.1" or "OCC-102.001" for namespaced non-§558 docs).
   *  See sectionNumbers.ts for the normalization/namespacing rules. */
  sectionNumber: string;
  /** The owning section's title (constant across every chunk that belongs
   *  to the same sectionNumber). */
  sectionTitle: string;
  /** Sub-heading text for a secondary chunk within a large section (e.g.
   *  "Not Hirable" within P&P §245). Null for a section's primary chunk. */
  subsectionLabel: string | null;
  /** 0 for a section's primary/lead chunk; 1.. for subsequent sub-chunks
   *  within the same sectionNumber. Distinguishes rows sharing one number. */
  chunkIndex: number;
  /** Position within the source document, for stable ordering / context
   *  reconstruction. Not guaranteed contiguous across sections. */
  sortOrder: number;
  bodyText: string;
}

export interface ParsedDocument {
  sourceType: KnowledgeSourceType;
  title: string;
  sourceFilename: string;
  /** Path relative to the repository root — the deterministic identity
   *  ingestion uses to detect "have I already ingested this file." */
  sourcePath: string;
  sourceStatus: KnowledgeSourceStatus;
  operationalAuthority: KnowledgeOperationalAuthority;
  /** ISO date, when the source itself states one (P&P footer "Updated:",
   *  a TAC "as in effect on" watermark, etc.). Null when not evidenced. */
  effectiveOrUpdatedDate: string | null;
  /** Bare section number of a document (P&P or Texas PAS) this document is
   *  conceptually linked to — e.g. the EPRP -> "256", the Occ. Code
   *  cross-reference -> "255". Null for P&P/Texas PAS documents themselves,
   *  which participate in cross-referencing directly via their sections'
   *  own sectionNumber instead of this field. */
  relatedSectionNumber: string | null;
  /** Free-form, source-derived provenance facts worth keeping but not
   *  worth their own column (e.g. a de-duplication note, a regulatory
   *  citation line, an approval-record snapshot). Never used by matching
   *  logic — display/audit only. */
  sourceMetadata: Record<string, unknown>;
  /** SHA-256 of the raw source file, for idempotent re-ingestion. */
  contentHash: string;
  sections: ParsedSection[];
  /** Non-fatal issues found while parsing this document (e.g. the P&P
   *  §287 duplication), surfaced in the source-coverage manifest. */
  warnings: string[];
}

// ───────────────────────────── DB rows ──────────────────────────────────

export interface KnowledgeDocumentRow {
  id: string;
  source_type: KnowledgeSourceType;
  title: string;
  source_filename: string;
  source_path: string;
  source_status: KnowledgeSourceStatus;
  operational_authority: KnowledgeOperationalAuthority;
  effective_or_updated_date: string | null;
  related_section_number: string | null;
  source_metadata: Record<string, unknown>;
  content_hash: string;
  supersedes_document_id: string | null;
  ingested_at: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSectionRow {
  id: string;
  document_id: string;
  section_number: string;
  section_title: string;
  subsection_label: string | null;
  chunk_index: number;
  sort_order: number;
  body_text: string;
  created_at: string;
  updated_at: string;
}

/** A knowledge_sections row joined with its parent document — the shape
 *  retrieval actually works with. */
export interface KnowledgeSectionWithDocument extends KnowledgeSectionRow {
  document: KnowledgeDocumentRow;
}

// ───────────────────────────── Retrieval ─────────────────────────────────

export interface KnowledgeCitation {
  documentId: string;
  sectionId: string;
  sourceType: KnowledgeSourceType;
  sourceTitle: string;
  sourceFilename: string;
  sourcePath: string;
  sectionNumber: string;
  sectionTitle: string;
  subsectionLabel: string | null;
  sourceStatus: KnowledgeSourceStatus;
  operationalAuthority: KnowledgeOperationalAuthority;
  effectiveOrUpdatedDate: string | null;
}

/** One retrieved piece of evidence. Deliberately carries the exact source
 *  text and full provenance and nothing synthesized — the next slice's LLM
 *  layer is responsible for interpretation, this layer is not. */
export interface KnowledgeEvidence {
  citation: KnowledgeCitation;
  excerpt: string;
  /** How this evidence was found — informs how much weight interpretation
   *  should give it (an explicit section-number match is stronger evidence
   *  of relevance than a keyword-overlap score). "section_context" is a
   *  sibling sub-chunk of an already-matched, multi-part P&P/Texas PAS
   *  section (e.g. once "281 List of Services" matches, its sibling
   *  "Services Serve Does Not Provide" sub-chunk is included too) — not
   *  independently relevance-scored, included because a policy section's
   *  boundary/exception content is part of the same answer as its main
   *  content, and omitting it risks an incomplete, unsafe answer (see
   *  the medication-assistance vs. medication-administration distinction
   *  this was built to preserve). */
  matchReason: "section_number_match" | "cross_reference_pair" | "text_relevance" | "section_context";
  /** Relevance score, 0-1. Not comparable across matchReason kinds. */
  score: number;
}
