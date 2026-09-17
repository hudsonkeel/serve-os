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

// A topic Serve already reliably knows from the resident's own canonical profile (entered at
// resident creation, synced from AxisCare, etc.) -- NOT something this assessment conversation
// established. Deliberately carries no assertionState and no value: structurally incapable of
// representing a Yes/No/claim, only "this topic is already answered, from elsewhere." A profile
// fact satisfying coverage must never be treated as though the resident said it during this
// conversation -- see buildCanonicalCoverageFacts() below and assessmentProjection.ts, which is
// the one place actual profile VALUES are surfaced (tagged by source) for display.
export interface CanonicalCoverageFact {
  readonly fieldPath: string;
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
  /** canonicalFacts is accepted but ignored by every existing trigger except
   * notRecognizedPartnerCommunity below -- none of today's Conditional triggers concern a topic
   * canonical profile data could ever speak to (they're all about what THIS conversation just
   * revealed), so adding the parameter here, once, is enough for any trigger that does need it. */
  readonly trigger: (facts: readonly CoverageFact[], canonicalFacts: readonly CanonicalCoverageFact[]) => boolean;
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

// A resident's community affiliation is structural -- resolved at assessment-session start from
// the resident's own community_id (see lib/assessmentIntelligence/communityResolution.ts),
// independent of whether the transcript happens to re-state it. Checking canonical presence
// here, not just an assessment fact, is the fix for the 2026-09-16 finding: a known Watermere at
// McKinney resident whose transcript never re-mentions the community by name was incorrectly
// asked for a full institutional street address anyway. Still also satisfied by the assessment
// itself explicitly confirming a community (any assertion state, not just confirmed_yes --
// consistent with every other topic-establishment check in this file, which is presence-only;
// the prior confirmed_yes-only check was narrower than everywhere else in this module for no
// stated reason).
function notRecognizedPartnerCommunity(facts: readonly CoverageFact[], canonicalFacts: readonly CanonicalCoverageFact[]): boolean {
  const established =
    facts.some((f) => f.fieldPath === "residence.community") || canonicalFacts.some((f) => f.fieldPath === "residence.community");
  return !established;
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

// A topic counts as established if EITHER source has it -- this assessment's own facts, or
// reliable canonical profile data already on file. Presence-only, exactly as before: coverage
// has never cared about a topic's VALUE, only whether it was addressed at all (a confirmed_no is
// just as "established" as a confirmed_yes -- silence is the only thing that means unknown).
function isTopicEstablished(
  topic: CoverageTopic,
  facts: readonly CoverageFact[],
  canonicalFacts: readonly CanonicalCoverageFact[]
): boolean {
  const established = (fieldPath: string) =>
    facts.some((f) => f.fieldPath === fieldPath) || canonicalFacts.some((f) => f.fieldPath === fieldPath);
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
 * "missing," invisible.
 *
 * canonicalFacts (optional, defaults to none -- every existing single-argument call site keeps
 * working unchanged) lets a caller combine reliable canonical resident/profile knowledge
 * (already on file before this conversation -- DOB, phone, community, address, physician
 * contact) with what this assessment itself established, per the 2026-09-16 finding: a known
 * Watermere at McKinney resident whose DOB/phone were entered at resident creation was
 * incorrectly flagged as still needing them. See buildCanonicalCoverageFacts() below for the one
 * place a Resident row gets turned into this shape. */
export function computeAssessmentCoverage(
  facts: readonly CoverageFact[],
  canonicalFacts: readonly CanonicalCoverageFact[] = []
): AssessmentCoverageSummary {
  const missingCore = CORE_TOPICS.filter((topic) => !isTopicEstablished(topic, facts, canonicalFacts));
  const missingConditional = CONDITIONAL_TOPICS.filter(
    (topic) => topic.trigger(facts, canonicalFacts) && !isTopicEstablished(topic, facts, canonicalFacts)
  );
  const missingTopics = [...missingCore, ...missingConditional].map((topic) => ({ id: topic.id, label: topic.label }));
  return { missingTopics, summary: buildCoverageSummary(missingTopics) };
}

// The minimal resident-shape this module needs -- deliberately not the full Resident type from
// lib/supabase/types.ts, keeping this module free of any dependency beyond the handful of
// fields it actually reads. The caller (lib/actions/assessmentIntelligence.ts) maps a real
// fetched Resident row into this shape; this function does no I/O itself.
export interface CanonicalResidentProfileFacts {
  readonly dateOfBirth: string | null;
  readonly phone: string | null;
  readonly communityId: string | null;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly physicianName: string | null;
  readonly physicianPhone: string | null;
  readonly primaryContactName: string | null;
}

/** Turns a resident's own canonical profile into the presence-only shape computeAssessmentCoverage()
 * accepts -- one entry per non-null field, nothing more. Never fabricates: a null/blank canonical
 * field simply contributes nothing, exactly like a topic never raised in conversation. */
export function buildCanonicalCoverageFacts(resident: CanonicalResidentProfileFacts): CanonicalCoverageFact[] {
  const facts: CanonicalCoverageFact[] = [];
  const addIfPresent = (fieldPath: string, value: string | null) => {
    if (value && value.trim()) facts.push({ fieldPath });
  };
  addIfPresent("identity.date_of_birth", resident.dateOfBirth);
  addIfPresent("identity.phone", resident.phone);
  addIfPresent("residence.community", resident.communityId);
  addIfPresent("residence.address_line1", resident.addressLine1);
  addIfPresent("residence.city", resident.city);
  addIfPresent("residence.state", resident.state);
  addIfPresent("residence.postal_code", resident.postalCode);
  addIfPresent("important_people.physician_name", resident.physicianName);
  addIfPresent("important_people.physician_phone", resident.physicianPhone);
  addIfPresent("important_people.primary_contact_name", resident.primaryContactName);
  return facts;
}
