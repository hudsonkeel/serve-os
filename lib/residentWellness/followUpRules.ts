// Deterministic Wellness Follow-Up rule engine. No LLM, no external calls —
// pure functions over the signals selected on a wellness observation. Each
// rule fires at most once per evaluation; see suggestWellnessFollowUps() for
// the precedence/deduplication contract.

import {
  WellnessFollowUpSuggestion,
  WellnessFollowUpType,
  WellnessNotePriority,
  WellnessSignalType,
} from "@/lib/supabase/types";

const PRIORITY_RANK: Record<WellnessNotePriority, number> = {
  routine: 0,
  monitor: 1,
  important: 2,
  urgent: 3,
};

// Never suggest a priority lower than `floor`; preserves anything higher.
function atLeast(
  priority: WellnessNotePriority,
  floor: WellnessNotePriority
): WellnessNotePriority {
  return PRIORITY_RANK[priority] >= PRIORITY_RANK[floor] ? priority : floor;
}

// Caps a suggestion at "monitor" regardless of how urgent the observation is —
// used by rules whose spec explicitly wants only "routine or monitor".
function capAtMonitor(priority: WellnessNotePriority): WellnessNotePriority {
  return priority === "routine" ? "routine" : "monitor";
}

function has(signals: Set<WellnessSignalType>, ...values: WellnessSignalType[]) {
  return values.every((value) => signals.has(value));
}

function hasAny(signals: Set<WellnessSignalType>, ...values: WellnessSignalType[]) {
  return values.some((value) => signals.has(value));
}

export interface WellnessFollowUpRuleInput {
  signals: WellnessSignalType[];
  observationPriority: WellnessNotePriority;
}

interface WellnessFollowUpRule {
  id: string;
  matches: (signals: Set<WellnessSignalType>) => boolean;
  build: (
    input: WellnessFollowUpRuleInput
  ) => Omit<WellnessFollowUpSuggestion, "ruleId">;
}

interface SuggestionSpec {
  title: string;
  description: string;
  followUpType: WellnessFollowUpType;
  suggestedDueDays: number;
}

function fixedPriority(
  spec: SuggestionSpec,
  priority: WellnessNotePriority,
  reason: string
): Omit<WellnessFollowUpSuggestion, "ruleId"> {
  return { ...spec, priority, reason };
}

// Rule order is the deterministic precedence — declaration order is
// evaluation order, and each rule is evaluated exactly once.
const RULES: WellnessFollowUpRule[] = [
  {
    id: "injury_mobility",
    matches: (s) => has(s, "injury", "mobility"),
    build: ({ observationPriority }) =>
      fixedPriority(
        {
          title: "Reassess mobility following injury",
          description:
            "Check whether walking, transfers, balance, or use of mobility equipment has changed since the reported injury.",
          followUpType: "mobility_review",
          suggestedDueDays: 14,
        },
        atLeast(observationPriority, "monitor"),
        "Selected signals include Recent Injury and Mobility."
      ),
  },
  {
    id: "injury_fall_risk",
    matches: (s) => has(s, "injury", "fall_risk"),
    build: ({ observationPriority }) =>
      fixedPriority(
        {
          title: "Review fall risk after injury",
          description:
            "Reassess stability, recent near-falls or falls, and whether additional supervision or precautions are needed.",
          followUpType: "safety_review",
          suggestedDueDays: 14,
        },
        atLeast(observationPriority, "monitor"),
        "Selected signals include Recent Injury and Fall Risk."
      ),
  },
  {
    id: "bathroom_equipment",
    matches: (s) => has(s, "bathroom_safety", "equipment"),
    build: ({ observationPriority }) =>
      fixedPriority(
        {
          title: "Confirm bathroom equipment is working safely",
          description:
            "Verify that the installed or recommended equipment is being used correctly and is improving bathroom safety.",
          followUpType: "equipment_review",
          suggestedDueDays: 14,
        },
        capAtMonitor(observationPriority),
        "Selected signals include Bathroom Safety and Equipment."
      ),
  },
  {
    id: "home_modification_accessibility",
    matches: (s) => has(s, "home_modification", "accessibility"),
    build: () =>
      fixedPriority(
        {
          title: "Review effectiveness of home modification",
          description:
            "Confirm the environmental change improved access and did not introduce a new safety concern.",
          followUpType: "safety_review",
          suggestedDueDays: 21,
        },
        "routine",
        "Selected signals include Home Modification and Accessibility."
      ),
  },
  {
    id: "hospital_transition",
    matches: (s) => hasAny(s, "hospital_rehab", "return_from_rehab"),
    build: () =>
      fixedPriority(
        {
          title: "Complete post-transition wellness check",
          description:
            "Confirm current mobility, medication routine, safety needs, service needs, and family concerns following the transition.",
          followUpType: "reassessment",
          suggestedDueDays: 3,
        },
        "important",
        "Selected signals include Hospital / Rehab or Return From Rehab."
      ),
  },
  {
    id: "medication_caregiver_concern",
    matches: (s) => has(s, "medication", "caregiver_concern"),
    build: () =>
      fixedPriority(
        {
          title: "Review medication support concern",
          description:
            "Clarify what was missed or changed, confirm the current support process, and determine whether further coordination is needed.",
          followUpType: "medication_review",
          suggestedDueDays: 3,
        },
        "important",
        "Selected signals include Medication and Caregiver Concern."
      ),
  },
  {
    id: "nutrition_hydration",
    matches: (s) => has(s, "nutrition_hydration"),
    build: () =>
      fixedPriority(
        {
          title: "Recheck nutrition and hydration concern",
          description:
            "Confirm whether intake has improved, remained stable, or worsened.",
          followUpType: "resident_check_in",
          suggestedDueDays: 7,
        },
        "monitor",
        "Selected signals include Nutrition / Hydration."
      ),
  },
  {
    id: "cognition_caregiver_concern",
    matches: (s) => has(s, "cognition", "caregiver_concern"),
    build: () =>
      fixedPriority(
        {
          title: "Reassess reported cognitive change",
          description:
            "Confirm whether the observed change persists and whether family, community staff, or the care team need an update.",
          followUpType: "reassessment",
          suggestedDueDays: 7,
        },
        "important",
        "Selected signals include Cognition and Caregiver Concern."
      ),
  },
  {
    id: "social_wellbeing",
    matches: (s) => hasAny(s, "isolation", "mood_behavior"),
    build: () =>
      fixedPriority(
        {
          title: "Check resident social and emotional wellbeing",
          description:
            "Follow up on mood, engagement, participation, and any ongoing isolation concerns.",
          followUpType: "resident_check_in",
          suggestedDueDays: 14,
        },
        "monitor",
        "Selected signals include Isolation or Mood / Behavior."
      ),
  },
  {
    id: "family_update",
    matches: (s) => has(s, "family_update"),
    build: ({ observationPriority }) =>
      fixedPriority(
        {
          title: "Complete family follow-up",
          description:
            "Contact the appropriate family member regarding the observation and document the outcome.",
          followUpType: "family_update",
          suggestedDueDays: 3,
        },
        atLeast(observationPriority, "routine"),
        "Selected signals include Family Update."
      ),
  },
];

/**
 * Evaluates every rule once, in declaration order, against the selected
 * signals. A rule that matches contributes at most one suggestion; a
 * defensive dedup pass (by rule id and by exact title) guards against any
 * future rule accidentally overlapping another. Returns [] when nothing
 * matches.
 */
export function suggestWellnessFollowUps(
  input: WellnessFollowUpRuleInput
): WellnessFollowUpSuggestion[] {
  const uniqueSignals = new Set(input.signals);
  const suggestions: WellnessFollowUpSuggestion[] = [];
  const seenRuleIds = new Set<string>();
  const seenTitles = new Set<string>();

  for (const rule of RULES) {
    if (seenRuleIds.has(rule.id)) continue;
    if (!rule.matches(uniqueSignals)) continue;

    const built = rule.build(input);
    if (seenTitles.has(built.title)) continue;

    seenRuleIds.add(rule.id);
    seenTitles.add(built.title);
    suggestions.push({ ruleId: rule.id, ...built });
  }

  return suggestions;
}

/** Adds suggestedDueDays to observedAt, returning a "YYYY-MM-DD" input value. */
export function suggestedDueDateValue(
  observedAt: string,
  suggestedDueDays: number | null
): string {
  if (suggestedDueDays === null) return "";

  const base = new Date(observedAt);
  if (Number.isNaN(base.getTime())) return "";

  const due = new Date(base.getTime() + suggestedDueDays * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
}
