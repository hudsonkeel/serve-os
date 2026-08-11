// Core epistemic types for the assessment intelligence layer, and the normalization rules
// that enforce "unknown must remain unknown, not silently become false, No, or another
// affirmative operational statement" (governance requirement, docs/architecture/
// ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §11).
//
// assertion_state (what is claimed) and collection_method (how Serve learned it) are
// independent axes — a fact's truth-status and its provenance are never conflated into one
// enum. There is deliberately no "not_discussed" value: if a topic was never raised, no fact
// row exists for it at all — see normalizeExtractedFacts() below, which is the concrete
// enforcement point for this rule.

import { z } from "zod";
import { isKnownFieldPath, getFieldDefinition } from "./domainRegistry.ts";

export const ASSERTION_STATES = [
  "confirmed_yes",
  "confirmed_no",
  "uncertain",
  "conflicting",
  "not_applicable",
] as const;
export type AssertionState = (typeof ASSERTION_STATES)[number];

export const COLLECTION_METHODS = ["observed", "reported"] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export const CONFIDENCE_LEVELS = ["none", "low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** The shape an extraction source (LLM output today; any future source later) must produce. */
export const RawExtractedFactSchema = z.object({
  field_path: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  assertion_state: z.enum(ASSERTION_STATES),
  collection_method: z.enum(COLLECTION_METHODS).nullable().default(null),
  reporter: z.string().nullable().default(null),
  evidence: z.string().nullable().default(null),
  confidence: z.enum(CONFIDENCE_LEVELS),
});
export type RawExtractedFact = z.infer<typeof RawExtractedFactSchema>;

export const RawExtractionResponseSchema = z.object({
  facts: z.array(RawExtractedFactSchema),
});

export interface NormalizedDraftFact {
  fieldPath: string;
  domain: string;
  value: unknown;
  assertionState: AssertionState;
  collectionMethod: CollectionMethod | null;
  reporter: string | null;
  evidence: string | null;
  confidence: Confidence;
}

export interface RejectedFact {
  raw: unknown;
  reason: string;
}

export interface NormalizationResult {
  accepted: NormalizedDraftFact[];
  rejected: RejectedFact[];
}

/**
 * The single enforcement point for "unknown must remain unknown." Every extraction source
 * (today: the OpenAI pasted-transcript call; later: any transcription-derived extraction) must
 * pass its raw output through this function before a single row is written to
 * assessment_draft_facts. Rejections are never silently dropped — they are returned so the
 * caller can log/surface them, since a rejection here usually means the extraction source
 * tried to do exactly the thing this function exists to prevent.
 */
export function normalizeExtractedFacts(rawFacts: unknown[]): NormalizationResult {
  const accepted: NormalizedDraftFact[] = [];
  const rejected: RejectedFact[] = [];

  for (const raw of rawFacts) {
    const parsed = RawExtractedFactSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ raw, reason: `Schema validation failed: ${parsed.error.message}` });
      continue;
    }
    const fact = parsed.data;

    if (!isKnownFieldPath(fact.field_path)) {
      rejected.push({ raw, reason: `Unknown field_path "${fact.field_path}" — not in the domain registry` });
      continue;
    }

    // The core "unknown ≠ false" guard: an affirmative or negative claim with no evidence and
    // no confidence is not a fact, it's a fabrication. Reject it rather than let it become an
    // operational "No."
    const isAffirmativeClaim = fact.assertion_state === "confirmed_yes" || fact.assertion_state === "confirmed_no";
    if (isAffirmativeClaim && fact.confidence === "none") {
      rejected.push({
        raw,
        reason: `"${fact.field_path}" claims ${fact.assertion_state} with confidence "none" and no supporting basis — refusing to let an unknown become an affirmative/negative fact`,
      });
      continue;
    }
    if (isAffirmativeClaim && !fact.evidence && fact.collection_method === "reported") {
      rejected.push({
        raw,
        reason: `"${fact.field_path}" claims ${fact.assertion_state} as reported, with no evidence quote — a reported claim requires some evidence text`,
      });
      continue;
    }

    const definition = getFieldDefinition(fact.field_path);

    accepted.push({
      fieldPath: fact.field_path,
      domain: definition!.domain,
      value: fact.value,
      assertionState: fact.assertion_state,
      collectionMethod: fact.collection_method,
      reporter: fact.reporter,
      evidence: fact.evidence,
      confidence: fact.confidence,
    });
  }

  return { accepted, rejected };
}
