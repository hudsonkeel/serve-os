// Current Needs content generation and merge logic — pure, no I/O. See
// data-placement principle A in the import's governing instructions:
// append only what isn't already represented, never overwrite, never
// invent a diagnosis from a plain-language description.
//
// The keyword table itself lives in lib/relationships/needsKeywords.ts —
// shared with lib/relationships/suggestionEngine.ts's resident-need
// suggestion detection, rather than each owning a private copy.
import { containsKeyword } from "./normalization.ts";
import { NEED_SENTENCE_OVERRIDES, keywordsForNeed } from "../../lib/relationships/needsKeywords.ts";

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function needToSentence(need: string): string {
  const override = NEED_SENTENCE_OVERRIDES[need.toLowerCase()];
  if (override) return override;
  const trimmed = need.trim().replace(/\.$/, "");
  return `${capitalize(trimmed)}.`;
}

function keywordsFor(need: string): readonly string[] {
  return keywordsForNeed(need);
}

export interface NeedsMergeResult {
  readonly alreadyRepresented: readonly string[];
  readonly newNeeds: readonly string[];
  readonly appendedContent: string | null; // null when nothing new to add
  readonly mergedContent: string; // existingContent + appendedContent, or just existingContent
}

// Given a resident's existing Current Needs content (empty string if none
// exists yet) and a list of raw need phrases from a source, decides which
// needs are new and produces the merged content — additive only, existing
// content is never removed or reordered.
export function mergeNeeds(existingContent: string, needs: readonly string[]): NeedsMergeResult {
  const alreadyRepresented: string[] = [];
  const newNeeds: string[] = [];

  for (const need of needs) {
    if (containsKeyword(existingContent, keywordsFor(need))) {
      alreadyRepresented.push(need);
    } else {
      newNeeds.push(need);
    }
  }

  if (newNeeds.length === 0) {
    return { alreadyRepresented, newNeeds, appendedContent: null, mergedContent: existingContent };
  }

  const appendedContent = newNeeds.map(needToSentence).join(" ");
  const mergedContent = existingContent.trim().length > 0 ? `${existingContent.trim()} ${appendedContent}` : appendedContent;

  return { alreadyRepresented, newNeeds, appendedContent, mergedContent };
}
