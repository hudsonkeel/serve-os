// Canonical field taxonomy for the assessment intelligence layer — see
// docs/architecture/ASSESSMENT_TO_CLIENT_OPERATIONALIZATION.md §4/§5. This registry is the
// single source of truth for which `field_path` values are valid on
// assessment_draft_facts/assessment_approved_facts, and what each one means for the review UI
// and the deterministic pricing/service-recommendation engine. Extending coverage later is a
// change to this file, never a database migration — the domain/field_path model is
// deliberately schema-flexible (Phase 2's finding from the earlier Serve Intake Engine work:
// a rigid, hand-authored field tree cannot grow without a code change every time).
//
// AxisCare's schema is never allowed to become this registry — it is a superset; AxisCare's
// required-field list (lib/assessmentIntelligence/axiscareReadiness.ts) is a filter view over
// it, never the other way around.

export type AssessmentDomain =
  | "identity"
  | "residence"
  | "important_people"
  | "what_why"
  | "daily_life"
  | "mobility_safety"
  | "vision_hearing"
  | "cognition"
  | "health"
  | "advance_planning"
  | "when"
  | "serve_relationship_intelligence";

export interface FieldDefinition {
  fieldPath: string;
  domain: AssessmentDomain;
  label: string;
  /** Required for the field's parent topic to be considered "covered" in the review UI. */
  requiredForReview?: boolean;
  /** Required before "Make Active Client" / AxisCare preview may be offered. */
  requiredForOperationalization?: boolean;
  /** True for a plain yes/no fact; false for a free-text/structured value. */
  isBoolean?: boolean;
}

export const DOMAIN_LABELS: Record<AssessmentDomain, string> = {
  identity: "Identity",
  residence: "Residence",
  important_people: "Important People",
  what_why: "What / Why",
  daily_life: "Daily Life",
  mobility_safety: "Mobility / Safety",
  vision_hearing: "Vision / Hearing",
  cognition: "Cognition",
  health: "Health",
  advance_planning: "Advance Planning",
  when: "When",
  serve_relationship_intelligence: "Serve Relationship Intelligence",
};

export const FIELD_REGISTRY: FieldDefinition[] = [
  // Identity
  { fieldPath: "identity.preferred_name", domain: "identity", label: "Preferred name" },
  { fieldPath: "identity.date_of_birth", domain: "identity", label: "Date of birth", requiredForOperationalization: true },
  { fieldPath: "identity.phone", domain: "identity", label: "Phone" },
  { fieldPath: "identity.email", domain: "identity", label: "Email" },

  // Residence
  { fieldPath: "residence.address_line1", domain: "residence", label: "Address" },
  { fieldPath: "residence.apartment_unit", domain: "residence", label: "Apartment / unit" },
  { fieldPath: "residence.community", domain: "residence", label: "Community" },
  { fieldPath: "residence.residence_type", domain: "residence", label: "Residence type" },

  // Important People
  { fieldPath: "important_people.primary_contact_name", domain: "important_people", label: "Primary contact", requiredForReview: true },
  { fieldPath: "important_people.primary_contact_relationship", domain: "important_people", label: "Relationship to person" },
  { fieldPath: "important_people.primary_contact_phone", domain: "important_people", label: "Primary contact phone", requiredForOperationalization: true },
  { fieldPath: "important_people.decision_maker", domain: "important_people", label: "Decision maker" },
  { fieldPath: "important_people.emergency_contact", domain: "important_people", label: "Emergency contact" },

  // What / Why
  { fieldPath: "what_why.what_changed", domain: "what_why", label: "What changed" },
  { fieldPath: "what_why.why_now", domain: "what_why", label: "Why now" },
  { fieldPath: "what_why.primary_goals", domain: "what_why", label: "Primary goals", requiredForReview: true },
  { fieldPath: "what_why.acceptance_of_care", domain: "what_why", label: "Acceptance / resistance to care" },

  // Daily Life
  { fieldPath: "daily_life.bathing", domain: "daily_life", label: "Bathing", isBoolean: true },
  { fieldPath: "daily_life.dressing", domain: "daily_life", label: "Dressing", isBoolean: true },
  { fieldPath: "daily_life.grooming", domain: "daily_life", label: "Grooming", isBoolean: true },
  { fieldPath: "daily_life.toileting", domain: "daily_life", label: "Toileting", isBoolean: true },
  { fieldPath: "daily_life.continence", domain: "daily_life", label: "Continence", isBoolean: true },
  { fieldPath: "daily_life.transfers", domain: "daily_life", label: "Transfers", isBoolean: true },
  { fieldPath: "daily_life.meals_nutrition", domain: "daily_life", label: "Meals / nutrition", isBoolean: true },
  { fieldPath: "daily_life.meal_preparation", domain: "daily_life", label: "Meal preparation", isBoolean: true },
  { fieldPath: "daily_life.laundry", domain: "daily_life", label: "Laundry", isBoolean: true },
  { fieldPath: "daily_life.housekeeping", domain: "daily_life", label: "Housekeeping", isBoolean: true },
  { fieldPath: "daily_life.transportation_errands", domain: "daily_life", label: "Transportation / errands", isBoolean: true },
  { fieldPath: "daily_life.companionship_social", domain: "daily_life", label: "Companionship / social support", isBoolean: true },
  { fieldPath: "daily_life.medication_reminders", domain: "daily_life", label: "Medication reminders", isBoolean: true, requiredForReview: true },

  // Mobility / Safety
  { fieldPath: "mobility_safety.recent_falls", domain: "mobility_safety", label: "Recent falls", isBoolean: true, requiredForReview: true },
  { fieldPath: "mobility_safety.gait_steadiness", domain: "mobility_safety", label: "Gait / steadiness" },
  { fieldPath: "mobility_safety.walker", domain: "mobility_safety", label: "Walker", isBoolean: true },
  { fieldPath: "mobility_safety.cane", domain: "mobility_safety", label: "Cane", isBoolean: true },
  { fieldPath: "mobility_safety.wheelchair", domain: "mobility_safety", label: "Wheelchair", isBoolean: true },
  { fieldPath: "mobility_safety.shower_equipment", domain: "mobility_safety", label: "Shower equipment", isBoolean: true },
  { fieldPath: "mobility_safety.environmental_concerns", domain: "mobility_safety", label: "Environmental concerns" },

  // Vision / Hearing
  { fieldPath: "vision_hearing.glasses", domain: "vision_hearing", label: "Glasses", isBoolean: true },
  { fieldPath: "vision_hearing.visual_impairment", domain: "vision_hearing", label: "Visual impairment", isBoolean: true },
  { fieldPath: "vision_hearing.hearing_difficulty", domain: "vision_hearing", label: "Hearing difficulty", isBoolean: true },
  { fieldPath: "vision_hearing.hearing_aids", domain: "vision_hearing", label: "Hearing aids", isBoolean: true },

  // Cognition
  { fieldPath: "cognition.short_term_memory_change", domain: "cognition", label: "Short-term memory change", isBoolean: true },
  { fieldPath: "cognition.repeated_questions", domain: "cognition", label: "Repeated questions", isBoolean: true },
  { fieldPath: "cognition.missed_appointments", domain: "cognition", label: "Missed appointments", isBoolean: true },
  { fieldPath: "cognition.medication_mistakes", domain: "cognition", label: "Medication mistakes", isBoolean: true },
  { fieldPath: "cognition.disorientation", domain: "cognition", label: "Disorientation", isBoolean: true },
  { fieldPath: "cognition.wandering", domain: "cognition", label: "Wandering", isBoolean: true, requiredForReview: true },
  { fieldPath: "cognition.known_diagnosis", domain: "cognition", label: "Known cognitive diagnosis (explicitly stated)" },

  // Health
  { fieldPath: "health.diagnoses", domain: "health", label: "Diagnoses (explicitly provided)" },
  { fieldPath: "health.allergies", domain: "health", label: "Allergies", requiredForReview: true },
  { fieldPath: "health.recent_hospitalization", domain: "health", label: "Recent hospitalization / rehab", isBoolean: true },
  { fieldPath: "health.blood_thinners", domain: "health", label: "Blood thinners", isBoolean: true },
  { fieldPath: "health.oxygen", domain: "health", label: "Oxygen", isBoolean: true },
  { fieldPath: "health.dietary_restrictions", domain: "health", label: "Dietary restrictions" },

  // Advance Planning
  { fieldPath: "advance_planning.dnr", domain: "advance_planning", label: "DNR", isBoolean: true },
  { fieldPath: "advance_planning.advance_directive", domain: "advance_planning", label: "Advance directive", isBoolean: true },
  { fieldPath: "advance_planning.medical_poa", domain: "advance_planning", label: "Medical POA", isBoolean: true },
  { fieldPath: "advance_planning.financial_poa", domain: "advance_planning", label: "Financial POA", isBoolean: true },

  // When
  { fieldPath: "when.desired_start_timing", domain: "when", label: "Desired start timing", requiredForReview: true },
  { fieldPath: "when.preferred_days", domain: "when", label: "Preferred days" },
  { fieldPath: "when.preferred_time_windows", domain: "when", label: "Preferred time windows" },
  { fieldPath: "when.frequency", domain: "when", label: "Frequency" },
  { fieldPath: "when.duration", domain: "when", label: "Duration" },

  // Serve Relationship Intelligence
  { fieldPath: "serve_relationship_intelligence.primary_motivation", domain: "serve_relationship_intelligence", label: "Primary motivation for seeking help" },
  { fieldPath: "serve_relationship_intelligence.family_caregiver_stress", domain: "serve_relationship_intelligence", label: "Family / caregiver stress" },
  { fieldPath: "serve_relationship_intelligence.barriers_to_acceptance", domain: "serve_relationship_intelligence", label: "Barriers to accepting care" },
  { fieldPath: "serve_relationship_intelligence.important_preferences", domain: "serve_relationship_intelligence", label: "Important personal preferences" },
];

const FIELD_BY_PATH: Map<string, FieldDefinition> = new Map(
  FIELD_REGISTRY.map((f) => [f.fieldPath, f])
);

export function getFieldDefinition(fieldPath: string): FieldDefinition | undefined {
  return FIELD_BY_PATH.get(fieldPath);
}

export function isKnownFieldPath(fieldPath: string): boolean {
  return FIELD_BY_PATH.has(fieldPath);
}

export function fieldsForDomain(domain: AssessmentDomain): FieldDefinition[] {
  return FIELD_REGISTRY.filter((f) => f.domain === domain);
}

export function requiredForReviewFields(): FieldDefinition[] {
  return FIELD_REGISTRY.filter((f) => f.requiredForReview);
}

export function requiredForOperationalizationFields(): FieldDefinition[] {
  return FIELD_REGISTRY.filter((f) => f.requiredForOperationalization);
}
