// Informational assessment coverage — "what important topics has Serve not yet learned about
// this person?" Purely read-time-computed from already-recorded facts: never writes a fact,
// never blocks approval or any downstream action, never infers "No" from silence. Answers a
// different question than reviewExceptions.ts's requiredForReview/missing_required mechanism
// (which flags a narrower legacy set of fields for the reviewer to explicitly resolve) — this
// module is the Core/Conditional/Supplemental classification surfaced as one conversational
// sentence, not a checklist. Assessment Contract / Coverage slice, 2026-09-15.
//
// Topics are classified, not gated:
//   Core         — normally established in a high-quality assessment; always evaluated.
//   Conditional  — only evaluated once its trigger fires (an earlier finding makes it
//                  relevant); invisible, not "missing," while unfired.
//   Supplemental — captured if naturally mentioned, never chased; has no entry here at all,
//                  so it can never appear as "missing."

import type { AssertionState } from "./factTypes.ts";

export interface CoverageFact {
  readonly fieldPath: string;
  readonly assertionState: AssertionState;
}

export interface CoverageTopic {
  readonly id: string;
  readonly label: string;
  readonly fieldPaths: readonly string[];
  /** false/undefined (default): "any" grouping -- legitimate alternatives for establishing the
   * same concept (any ONE field_path having a fact establishes the topic, e.g. which mobility
   * device, if any). true: "all" grouping -- complementary, non-substitutable fields that must
   * ALL be present (e.g. a decision-maker's name AND relationship AND phone; physician name AND
   * phone). One complementary field being known must never hide that another is still missing.
   * Irrelevant for a single-field-path topic. */
  readonly requireAll?: boolean;
}

export interface ConditionalCoverageTopic extends CoverageTopic {
  readonly trigger: (facts: readonly CoverageFact[]) => boolean;
}

function hasAssertionState(
  facts: readonly CoverageFact[],
  fieldPath: string,
  states: readonly AssertionState[]
): boolean {
  return facts.some((f) => f.fieldPath === fieldPath && states.includes(f.assertionState));
}

function cognitionConcern(facts: readonly CoverageFact[]): boolean {
  return (
    hasAssertionState(facts, "cognition.short_term_memory_change", ["confirmed_yes"]) ||
    hasAssertionState(facts, "cognition.disorientation", ["confirmed_yes"])
  );
}

function medicationReminderConfirmed(facts: readonly CoverageFact[]): boolean {
  return hasAssertionState(facts, "daily_life.medication_reminders", ["confirmed_yes"]);
}

function transfersWithReducedMobility(facts: readonly CoverageFact[]): boolean {
  const transfersConfirmed = hasAssertionState(facts, "daily_life.transfers", ["confirmed_yes"]);
  const reducedMobilitySignal =
    hasAssertionState(facts, "mobility_safety.recent_falls", ["confirmed_yes"]) ||
    hasAssertionState(facts, "mobility_safety.walker", ["confirmed_yes"]) ||
    hasAssertionState(facts, "mobility_safety.cane", ["confirmed_yes"]) ||
    hasAssertionState(facts, "mobility_safety.wheelchair", ["confirmed_yes"]);
  return transfersConfirmed && reducedMobilitySignal;
}

function poaMentioned(facts: readonly CoverageFact[]): boolean {
  return (
    hasAssertionState(facts, "advance_planning.medical_poa", ["confirmed_yes"]) ||
    hasAssertionState(facts, "advance_planning.financial_poa", ["confirmed_yes"])
  );
}

function notRecognizedPartnerCommunity(facts: readonly CoverageFact[]): boolean {
  return !hasAssertionState(facts, "residence.community", ["confirmed_yes"]);
}

export const CORE_TOPICS: readonly CoverageTopic[] = [
  { id: "dob", label: "date of birth", fieldPaths: ["identity.date_of_birth"] },
  { id: "basic_contact", label: "phone number", fieldPaths: ["identity.phone"] },
  { id: "primary_contact", label: "primary contact", fieldPaths: ["important_people.primary_contact_name"] },
  // All-of: knowing the physician's name but not the phone (or vice versa) is still a real gap.
  {
    id: "physician_contact",
    label: "physician's name and phone number",
    fieldPaths: ["important_people.physician_name", "important_people.physician_phone"],
    requireAll: true,
  },
  { id: "primary_goals", label: "primary goals for care", fieldPaths: ["what_why.primary_goals"] },

  { id: "adl_bathing", label: "bathing", fieldPaths: ["daily_life.bathing"] },
  { id: "adl_dressing", label: "dressing", fieldPaths: ["daily_life.dressing"] },
  { id: "adl_grooming", label: "grooming", fieldPaths: ["daily_life.grooming"] },
  { id: "adl_toileting", label: "toileting", fieldPaths: ["daily_life.toileting"] },
  { id: "adl_continence", label: "continence", fieldPaths: ["daily_life.continence"] },
  { id: "adl_transfers", label: "transfers", fieldPaths: ["daily_life.transfers"] },
  { id: "adl_meals", label: "meals and nutrition", fieldPaths: ["daily_life.meals_nutrition"] },
  { id: "adl_meal_prep", label: "meal preparation", fieldPaths: ["daily_life.meal_preparation"] },
  { id: "adl_laundry", label: "laundry", fieldPaths: ["daily_life.laundry"] },
  { id: "adl_housekeeping", label: "housekeeping", fieldPaths: ["daily_life.housekeeping"] },
  { id: "adl_transportation", label: "transportation and errands", fieldPaths: ["daily_life.transportation_errands"] },
  { id: "adl_companionship", label: "companionship and social support", fieldPaths: ["daily_life.companionship_social"] },
  { id: "medication_reminders", label: "medication reminder needs", fieldPaths: ["daily_life.medication_reminders"] },

  { id: "recent_falls", label: "recent falls", fieldPaths: ["mobility_safety.recent_falls"] },
  { id: "gait_mobility", label: "gait and mobility", fieldPaths: ["mobility_safety.gait_steadiness"] },
  // Any-of: legitimate alternatives -- knowing about any one mobility device answers "does this
  // person use a mobility device," which is the actual topic.
  {
    id: "mobility_devices",
    label: "mobility devices",
    fieldPaths: ["mobility_safety.walker", "mobility_safety.cane", "mobility_safety.wheelchair", "mobility_safety.shower_equipment"],
  },
  { id: "environmental_concerns", label: "environmental concerns", fieldPaths: ["mobility_safety.environmental_concerns"] },

  // Vision and hearing are separate Core topics -- distinct senses, not alternative ways of
  // establishing one concept.
  { id: "vision_impairment", label: "vision impairment", fieldPaths: ["vision_hearing.visual_impairment"] },
  { id: "hearing_impairment", label: "hearing impairment", fieldPaths: ["vision_hearing.hearing_difficulty"] },

  // Same reasoning as vision/hearing -- distinct, non-substitutable cognitive screening
  // questions, not alternative signals for one concept.
  { id: "short_term_memory", label: "short-term memory changes", fieldPaths: ["cognition.short_term_memory_change"] },
  { id: "disorientation", label: "disorientation", fieldPaths: ["cognition.disorientation"] },

  { id: "health_conditions", label: "health conditions relevant to care", fieldPaths: ["health.diagnoses"] },
  { id: "allergies", label: "allergies", fieldPaths: ["health.allergies"] },
  { id: "recent_hospitalization", label: "recent hospitalization", fieldPaths: ["health.recent_hospitalization"] },
  { id: "dietary_restrictions", label: "dietary restrictions", fieldPaths: ["health.dietary_restrictions"] },
  // Core, unconditional: simple universal safety questions that shouldn't depend on the system
  // correctly recognizing another trigger first.
  { id: "swallowing_risk", label: "swallowing risk", fieldPaths: ["health.swallowing_risk"] },
  { id: "precautions_restrictions", label: "precautions or restrictions", fieldPaths: ["health.precautions_restrictions"] },

  // Desired start timing, frequency, and duration are separate Core topics -- each is its own
  // distinct question, not an alternative way of answering the others.
  { id: "desired_start_timing", label: "desired start timing", fieldPaths: ["when.desired_start_timing"] },
  { id: "care_frequency", label: "care frequency", fieldPaths: ["when.frequency"] },
  { id: "visit_duration", label: "visit duration", fieldPaths: ["when.duration"] },
];

export const CONDITIONAL_TOPICS: readonly ConditionalCoverageTopic[] = [
  { id: "wandering", label: "wandering", fieldPaths: ["cognition.wandering"], trigger: cognitionConcern },
  { id: "behavior_concerns", label: "behavior concerns", fieldPaths: ["cognition.behavior_concerns"], trigger: cognitionConcern },
  {
    id: "medication_timing",
    label: "medication timing",
    fieldPaths: ["daily_life.medication_timing"],
    trigger: medicationReminderConfirmed,
  },
  {
    id: "medication_setup",
    label: "medication setup",
    fieldPaths: ["daily_life.medication_setup"],
    trigger: medicationReminderConfirmed,
  },
  {
    id: "transfer_lift_equipment",
    label: "transfer equipment",
    fieldPaths: ["mobility_safety.transfer_lift_equipment"],
    trigger: transfersWithReducedMobility,
  },
  // All-of: a decision-maker's name alone (or any one component alone) isn't "structured
  // decision-maker details" -- name, relationship, AND phone are all needed.
  {
    id: "decision_maker_details",
    label: "decision-maker details",
    fieldPaths: ["important_people.decision_maker", "important_people.decision_maker_relationship", "important_people.decision_maker_phone"],
    requireAll: true,
    trigger: poaMentioned,
  },
  // All-of over the components that actually constitute a complete, usable address.
  // apartment/unit is deliberately excluded -- real but optional detail, not part of what makes
  // an address complete (mentioning it alone must not make this topic look covered).
  {
    id: "full_address",
    label: "full address",
    fieldPaths: ["residence.address_line1", "residence.city", "residence.state", "residence.postal_code"],
    requireAll: true,
    trigger: notRecognizedPartnerCommunity,
  },
];

function isTopicEstablished(topic: CoverageTopic, facts: readonly CoverageFact[]): boolean {
  const established = (fieldPath: string) => facts.some((f) => f.fieldPath === fieldPath);
  return topic.requireAll ? topic.fieldPaths.every(established) : topic.fieldPaths.some(established);
}

export interface MissingCoverageTopic {
  readonly id: string;
  readonly label: string;
}

export interface AssessmentCoverageSummary {
  readonly missingTopics: readonly MissingCoverageTopic[];
  readonly summary: string | null;
}

function joinWithAnd(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildCoverageSummary(missingTopics: readonly MissingCoverageTopic[]): string | null {
  const count = missingTopics.length;
  if (count === 0) return null;
  const labels = missingTopics.map((t) => t.label);
  if (count === 1) {
    return `Based on the assessment conversation, 1 important topic still needs clarification: ${labels[0]}.`;
  }
  if (count <= 5) {
    return `Based on the assessment conversation, ${count} important topics still need clarification: ${joinWithAnd(labels)}.`;
  }
  return `Based on the assessment conversation, ${count} important topics still need clarification, including ${joinWithAnd(labels.slice(0, 5))}, and more.`;
}

/** Pure, read-time-only: never writes a fact, never blocks approval or any downstream action.
 * A Conditional topic whose trigger hasn't fired is simply absent from the output -- not
 * "missing," invisible. */
export function computeAssessmentCoverage(facts: readonly CoverageFact[]): AssessmentCoverageSummary {
  const missingCore = CORE_TOPICS.filter((topic) => !isTopicEstablished(topic, facts));
  const missingConditional = CONDITIONAL_TOPICS.filter((topic) => topic.trigger(facts) && !isTopicEstablished(topic, facts));
  const missingTopics = [...missingCore, ...missingConditional].map((topic) => ({ id: topic.id, label: topic.label }));
  return { missingTopics, summary: buildCoverageSummary(missingTopics) };
}
