import type { PipelineStage, RelationshipTouchType } from "../supabase/types.ts";
import { detectNeedsInText } from "./needsKeywords.ts";

// Deterministic, pure suggestion generation for a just-logged Interaction —
// no AI call, no external service. Every rule here either quotes the
// narrative back (a sentence, a phrase) or applies a small, documented
// lookup — never infers a diagnosis, an approved/started service, or a
// fact the narrative doesn't state. See
// docs/architecture/relationship-intelligence-phase-1-implementation.md
// for why Phase 1 has no approved AI/language-generation provider to call
// instead, and lib/intelligence/core/README.md for why Insight/Context
// wiring into a real intelligence kernel is deferred until this exact
// requirements work happens.

export type SuggestionType =
  | "summary"
  | "commitment"
  | "open_loop"
  | "next_action"
  | "working_note"
  | "service_opportunity"
  | "stage_change"
  | "resident_need";

export interface SuggestionDraft {
  readonly suggestionType: SuggestionType;
  readonly payload: Record<string, unknown>;
  readonly rationale: string;
}

export interface GenerateSuggestionsInput {
  readonly narrative: string;
  readonly touchType: RelationshipTouchType;
  readonly interactionResult: string | null;
  readonly hasExplicitNextAction: boolean;
  readonly isResidentLinked: boolean;
  readonly currentStage: PipelineStage;
  // The resident's existing Current Needs content ("" if none) — resident-
  // need candidates are only proposed for needs not already represented
  // here. Ignored when isResidentLinked is false.
  readonly existingResidentNeedsContent: string;
}

const SENTENCE_SPLIT = /(?<=[.?!])\s+/;

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const COMMITMENT_KEYWORDS = [
  "will call",
  "will follow up",
  "will follow-up",
  "will send",
  "will bring",
  "will get back",
  "will reach out",
  "agreed to",
  "promised",
  "going to call",
  "going to send",
];

const FAMILY_HINT_KEYWORDS = ["family", "daughter", "son", "spouse", "wife", "husband", "they will", "they'll"];

function looksLikeCommitment(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return COMMITMENT_KEYWORDS.some((k) => lower.includes(k));
}

function guessResponsiblePartyType(sentence: string): string {
  const lower = sentence.toLowerCase();
  return FAMILY_HINT_KEYWORDS.some((k) => lower.includes(k)) ? "family" : "serve";
}

// interactionResult -> a stage worth suggesting, only when it represents
// meaningful forward or backward movement. Never emitted if it matches
// the relationship's current stage already (change_relationship_stage
// itself also no-ops on that case; this avoids proposing a no-op).
const STAGE_ORDER: readonly PipelineStage[] = [
  "new_inquiry",
  "contact_attempted",
  "connected",
  "discovery",
  "assessment_scheduled",
  "assessment_completed",
  "proposal_in_progress",
  "proposal_sent",
  "considering",
  "follow_up_needed",
  "ready_to_start",
  "won",
];

const RESULT_TO_STAGE: Partial<Record<string, PipelineStage>> = {
  meeting_scheduled: "assessment_scheduled",
  service_interest_confirmed: "ready_to_start",
  not_interested: "closed_lost",
};

function stageIndex(stage: PipelineStage): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

const FREQUENCY_OR_DURATION_HINTS = [
  /\b\d+\s*(hour|hr|minute|min)s?\b/i,
  /\b(once|twice|\d+)\s*(a|per)\s*(day|week|month)\b/i,
  /\bevery\s+(day|week|other day)\b/i,
];

function mentionsFrequencyOrDuration(text: string): boolean {
  return FREQUENCY_OR_DURATION_HINTS.some((re) => re.test(text));
}

function truncateForSummary(text: string): string {
  const firstSentence = splitSentences(text)[0] ?? text;
  if (firstSentence.length <= 140) return firstSentence;
  return `${firstSentence.slice(0, 137).trimEnd()}...`;
}

export function generateInteractionSuggestions(input: GenerateSuggestionsInput): SuggestionDraft[] {
  const narrative = input.narrative.trim();
  const suggestions: SuggestionDraft[] = [];
  if (!narrative) return suggestions;

  const sentences = splitSentences(narrative);

  // ─── Summary — always offered ────────────────────────────────────────
  suggestions.push({
    suggestionType: "summary",
    payload: { text: truncateForSummary(narrative) },
    rationale: "A short, editable summary distinct from the full narrative.",
  });

  // ─── Commitments ──────────────────────────────────────────────────────
  for (const sentence of sentences) {
    if (!looksLikeCommitment(sentence)) continue;
    suggestions.push({
      suggestionType: "commitment",
      payload: {
        description: sentence,
        responsiblePartyType: guessResponsiblePartyType(sentence),
      },
      rationale: `Narrative includes what reads like a commitment: "${sentence}"`,
    });
  }

  // ─── Open questions ───────────────────────────────────────────────────
  for (const sentence of sentences) {
    if (!sentence.endsWith("?")) continue;
    suggestions.push({
      suggestionType: "open_loop",
      payload: { question: sentence },
      rationale: `Narrative poses an unresolved question: "${sentence}"`,
    });
  }

  // ─── Next action — only if not already explicitly captured at intake ─
  if (
    !input.hasExplicitNextAction &&
    (input.interactionResult === "follow_up_requested" || input.interactionResult === "decision_pending")
  ) {
    suggestions.push({
      suggestionType: "next_action",
      payload: {
        title: "Follow up",
        actionType: "follow_up",
        priority: "normal",
      },
      rationale: `Interaction result ("${input.interactionResult}") suggests a follow-up is needed.`,
    });
  }

  // ─── Working note — always offered, holds the full narrative ────────
  suggestions.push({
    suggestionType: "working_note",
    payload: { content: narrative, category: "general" },
    rationale: "Preserves the full narrative as context, in case nothing else here fully captures it.",
  });

  // ─── Resident need + Service opportunity — resident-linked only ──────
  if (input.isResidentLinked) {
    const detectedNeeds = detectNeedsInText(narrative, input.existingResidentNeedsContent);
    for (const { need, sentence } of detectedNeeds) {
      suggestions.push({
        suggestionType: "resident_need",
        payload: { sentence },
        rationale: `Narrative mentions "${need}", not already reflected in this resident's Current Needs.`,
      });
    }

    if (detectedNeeds.length > 0 && mentionsFrequencyOrDuration(narrative)) {
      suggestions.push({
        suggestionType: "service_opportunity",
        payload: {
          serviceSummary: detectedNeeds.map((d) => d.need).join(", "),
        },
        rationale: "Narrative mentions both a need and a frequency/duration — proposed as planning context, not a schedule.",
      });
    }
  }

  // ─── Stage change ──────────────────────────────────────────────────────
  const suggestedStage = input.interactionResult ? RESULT_TO_STAGE[input.interactionResult] : undefined;
  if (suggestedStage && suggestedStage !== input.currentStage) {
    const movesForward = stageIndex(suggestedStage) > stageIndex(input.currentStage) || suggestedStage === "closed_lost";
    if (movesForward) {
      suggestions.push({
        suggestionType: "stage_change",
        payload: { toStage: suggestedStage },
        rationale: `Interaction result ("${input.interactionResult}") suggests moving to "${suggestedStage}".`,
      });
    }
  }

  return suggestions;
}
