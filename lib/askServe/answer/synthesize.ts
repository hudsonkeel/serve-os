// Ask Serve answer synthesis — the only place a model is invoked in this
// feature, and only ever with a non-empty, already-retrieved evidence
// set. See docs/architecture/ASK_SERVE_ANSWER_SYNTHESIS.md.
import { converseWithClaude, type BedrockConverseClient } from "../../ai/bedrockClaude.ts";
import type { KnowledgeEvidence } from "../knowledge/types.ts";
import { buildEvidencePacket, type EvidencePacket, type EvidencePacketItem } from "./evidencePacket.ts";
import { buildSynthesisSystemPrompt, buildSynthesisUserPrompt } from "./prompt.ts";
import { RawSynthesisResponseSchema, NOT_FOUND_ANSWER, type AskServeAnswer, type AskServeCitation } from "./types.ts";

/** A genuine model-provider failure (auth, network, throttling). The
 *  caller must show a retry/error state — never fall back to an
 *  ungrounded answer. */
export class AskServeSynthesisProviderError extends Error {}

/** The model's response could not be trusted as-is: invalid JSON, schema
 *  mismatch, or (the specific safety case this exists for) every cited
 *  evidence id turned out to be unknown, leaving a "supported"-flavored
 *  answer with zero real grounding. The caller must fail safely — never
 *  render partially parsed or ungrounded prose as authoritative. */
export class AskServeSynthesisValidationError extends Error {}

// Live Bedrock verification (2026-09-21) found Claude sometimes wraps its
// JSON response in a markdown code fence (```json ... ```) despite the
// system prompt explicitly saying "ONLY a single JSON object, no other
// text" — a well-known, common LLM behavior, not specific to this prompt.
// Stripped before parsing, never treated as part of the answer content.
function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function resolveCitations(citedEvidenceIds: string[], packet: EvidencePacket): AskServeCitation[] {
  const byId = new Map<string, EvidencePacketItem>(packet.items.map((item) => [item.evidenceId, item]));
  const resolved: AskServeCitation[] = [];

  for (const id of citedEvidenceIds) {
    const item = byId.get(id);
    // An id the model produced that doesn't match anything in the packet
    // it was given is dropped, never rendered — see the module header
    // comment on AskServeSynthesisValidationError for when this escalates
    // to a hard failure instead of a silent drop.
    if (!item) continue;
    resolved.push({
      evidenceId: item.evidenceId,
      sourceType: item.sourceType,
      sourceTitle: item.sourceTitle,
      sectionNumber: item.sectionNumber,
      sectionTitle: item.sectionTitle,
      subsectionLabel: item.subsectionLabel,
      sourceStatus: item.sourceStatus,
      operationalAuthority: item.operationalAuthority,
      excerpt: item.excerpt,
    });
  }
  return resolved;
}

export interface SynthesizeAskServeAnswerOptions {
  client?: BedrockConverseClient;
}

/**
 * Synthesizes a grounded AskServeAnswer from a question and already-
 * retrieved evidence. Never calls the model when evidence is empty — that
 * case is deterministic (NOT_FOUND) and handled without any provider call.
 *
 * Throws AskServeSynthesisProviderError on a model-invocation failure and
 * AskServeSynthesisValidationError when the model's output cannot be
 * trusted — both are the caller's (the server action's) responsibility to
 * turn into a safe, honest error state, never a fallback answer.
 */
export async function synthesizeAskServeAnswer(
  question: string,
  evidence: KnowledgeEvidence[],
  options: SynthesizeAskServeAnswerOptions = {}
): Promise<AskServeAnswer> {
  if (evidence.length === 0) {
    return NOT_FOUND_ANSWER;
  }

  const packet = buildEvidencePacket(evidence);

  let rawText: string;
  try {
    rawText = await converseWithClaude({
      system: buildSynthesisSystemPrompt(),
      user: buildSynthesisUserPrompt(question, packet),
      client: options.client,
    });
  } catch (err) {
    throw new AskServeSynthesisProviderError(err instanceof Error ? err.message : "Bedrock Claude invocation failed");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripMarkdownCodeFence(rawText));
  } catch {
    throw new AskServeSynthesisValidationError("Ask Serve's model response was not valid JSON.");
  }

  const parsed = RawSynthesisResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AskServeSynthesisValidationError(`Ask Serve's model response did not match the expected answer shape: ${parsed.error.message}`);
  }

  const citations = resolveCitations(parsed.data.citedEvidenceIds, packet);

  // Safety backstop: an answer claiming to be grounded (anything other
  // than not_found) must actually be grounded in at least one real,
  // resolved citation. If the model cited only unknown/invented ids, this
  // is exactly the "reject/repair/fail safely" case from the citation-
  // validation requirement — fail safely rather than render an
  // authoritative-sounding answer backed by nothing real.
  if (parsed.data.supportStatus !== "not_found" && citations.length === 0) {
    throw new AskServeSynthesisValidationError(
      "Ask Serve's model response cited no evidence that could be verified against the retrieved sources."
    );
  }

  return {
    supportStatus: parsed.data.supportStatus,
    answer: parsed.data.answer,
    operationalGuidance: parsed.data.operationalGuidance ?? null,
    importantNote: parsed.data.importantNote ?? null,
    citations,
  };
}
