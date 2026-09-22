// Ask Serve's answer synthesis contract — Slice 2. Two distinct shapes,
// deliberately never conflated:
//   - RawSynthesisResponse: exactly what the model is allowed to produce.
//     Citations here are bare evidence-id references — the model is never
//     trusted to restate a citation's sourceType/authority/etc itself,
//     since that would let a hallucinated authority label slip through
//     even when the cited evidence id is real.
//   - AskServeAnswer: what the server actually returns to the UI, with
//     every citation's real metadata reconstructed from the retrieved
//     evidence record it maps to — never from model-generated text. See
//     lib/askServe/answer/synthesize.ts's resolveCitations().
import { z } from "zod";
import type {
  KnowledgeOperationalAuthority,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
} from "../knowledge/types.ts";

export const SUPPORT_STATUSES = ["supported", "partially_supported", "needs_review", "not_found"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

// What the model must produce, and nothing more — validated immediately
// after JSON.parse, before any of it is trusted. citedEvidenceIds are the
// ONLY thing citations carry at this stage.
export const RawSynthesisResponseSchema = z.object({
  supportStatus: z.enum(SUPPORT_STATUSES),
  answer: z.string().min(1),
  operationalGuidance: z.string().nullable().optional(),
  importantNote: z.string().nullable().optional(),
  citedEvidenceIds: z.array(z.string()),
});
export type RawSynthesisResponse = z.infer<typeof RawSynthesisResponseSchema>;

/** One resolved citation — every field here comes from the actual
 *  retrieved evidence record (lib/askServe/knowledge/types.ts's
 *  KnowledgeCitation), never from model output. Safe to render directly:
 *  no database ids, no rank scores, no implementation metadata. */
export interface AskServeCitation {
  evidenceId: string;
  sourceType: KnowledgeSourceType;
  sourceTitle: string;
  sectionNumber: string;
  sectionTitle: string;
  subsectionLabel: string | null;
  sourceStatus: KnowledgeSourceStatus;
  operationalAuthority: KnowledgeOperationalAuthority;
  /** The exact retrieved excerpt this citation is grounded in — what lets
   *  a reader verify "yes, that is actually what our policy says." */
  excerpt: string;
}

export interface AskServeAnswer {
  supportStatus: SupportStatus;
  answer: string;
  operationalGuidance: string | null;
  importantNote: string | null;
  citations: AskServeCitation[];
}

/** The deterministic answer returned when retrieval found nothing —
 *  never produced by the model; see synthesize.ts, which skips the model
 *  call entirely in this case. */
export const NOT_FOUND_ANSWER: AskServeAnswer = {
  supportStatus: "not_found",
  answer:
    "I couldn't find an authoritative Serve policy, controlled procedure, or Texas PAS source that answers this question.",
  operationalGuidance: null,
  importantNote: null,
  citations: [],
};

export const CLIENT_SPECIFIC_NOT_FOUND_ANSWER: AskServeAnswer = {
  supportStatus: "not_found",
  answer:
    "Ask Serve currently answers questions about Serve policies/procedures and Texas PAS requirements — it doesn't look up individual client or resident records. Please use the resident's profile in Serve OS for client-specific information.",
  operationalGuidance: null,
  importantNote: null,
  citations: [],
};
