// Shared keyword table for detecting care/assistance needs in free text —
// substring-based, case-insensitive, deliberately simple over fuzzy or
// semantic matching so every match is auditable in a preview or a
// suggestion card. Originally built for the resident-source-notes import
// (scripts/importResidentSourceNotes/needsMerge.ts) and moved here so the
// Interaction suggestion engine (lib/relationships/suggestionEngine.ts)
// can reuse the exact same vocabulary rather than duplicating it.
export const NEED_KEYWORDS: Record<string, readonly string[]> = {
  "tv assistance": ["tv"],
  "medication reminders": ["medication"],
  "walker assistance": ["walker"],
  "bathroom assistance": ["bathroom"],
  "help using remote": ["remote"],
  "phone assistance": ["phone"],
  "tv and remote assistance": ["tv", "remote"],
  "meal assistance at times": ["meal"],
  "shower assistance": ["shower"],
  "washing machine assistance": ["washing machine", "laundry"],
  "air-conditioning and heat assistance": ["air-condition", "heat"],
  "help finding apartment": ["finding apartment", "finding her apartment", "finding his apartment"],
  "help with calls": ["calls"],
  "help with mail": ["mail"],
  "cannot walk without walker": ["cannot walk without", "walker"],
  "menu reminders": ["menu"],
  "reminders of the time": ["reminders of the time", "time reminder"],
  "reminders of the day of the week": ["day of the week"],
  "food drop-off": ["food drop"],
  "leg issues": ["leg issue", "legs"],
  "scooter assistance": ["scooter"],
  "reminders and help locating items": ["locating items"],
  "internet assistance": ["internet"],
  "help getting off scooter": ["off scooter", "off the scooter"],
  "assistance getting to the table": ["getting to the table", "to the table"],
  laundry: ["laundry"],
  linens: ["linens"],
  housekeeping: ["housekeeping"],
};

// Overrides where plain wording must be preserved rather than normalized
// into a generic "<Need>." sentence — never invent a diagnosis or
// fall-risk classification from a plain-language description.
export const NEED_SENTENCE_OVERRIDES: Record<string, string> = {
  "cannot walk without walker": "Resident reportedly cannot walk without a walker.",
  "leg issues": "Resident reportedly has significant leg issues.",
};

export function keywordsForNeed(need: string): readonly string[] {
  return NEED_KEYWORDS[need.toLowerCase()] ?? [need.toLowerCase()];
}

// True when `content` already mentions the concept behind `need`, judged
// by a bounded set of keyword variants — deliberately simple (substring,
// case-insensitive) rather than fuzzy/semantic matching, so its behavior
// is always predictable and auditable in a preview or suggestion card.
export function containsKeyword(content: string, keywords: readonly string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// Converts a plain-language need phrase into a resident Current Needs
// sentence — preserves stated limitations as reported, never adds a
// diagnosis or fall-risk classification.
export function needPhraseToSentence(need: string): string {
  const override = NEED_SENTENCE_OVERRIDES[need.toLowerCase()];
  if (override) return override;
  const trimmed = need.trim().replace(/\.$/, "");
  return `${capitalize(trimmed)}.`;
}

export interface DetectedNeed {
  readonly need: string;
  readonly sentence: string;
}

// Scans free-form text (an Interaction narrative) for known need
// keywords, skipping anything already represented in `existingContent`
// (a resident's current Current Needs text, or "" if none). Used by
// lib/relationships/suggestionEngine.ts to propose resident-need
// suggestion candidates — never invents a need the text doesn't mention.
export function detectNeedsInText(text: string, existingContent: string): DetectedNeed[] {
  const detected: DetectedNeed[] = [];
  for (const need of Object.keys(NEED_KEYWORDS)) {
    const keywords = keywordsForNeed(need);
    if (!containsKeyword(text, keywords)) continue;
    if (containsKeyword(existingContent, keywords)) continue;
    detected.push({ need, sentence: needPhraseToSentence(need) });
  }
  return detected;
}
