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
  /** Required for the field's parent topic to be considered "covered" in the review UI.
   * Predates and is narrower than the Core/Conditional/Supplemental coverage computation
   * (coverage.ts) — kept as-is for this pilot rather than removed, since the two mechanisms
   * don't conflict (the review UI shows only the new coverage summary; this still drives its
   * own `missing_required` exceptions, which stay computed but unrendered here). Revisit after
   * the Watermere pilot validates the new coverage behavior. */
  requiredForReview?: boolean;
  /** Recommended (never a hard blocker) before proposing an AxisCare client-create payload —
   * Slice B.1 (2026-09-18) reclassified this from a hard "requiredForOperationalization" gate
   * after tracing AxisCare's own checked-in OpenAPI contract (docs/integrations/axiscare/
   * AxisCare-Customer-API-OpenAPI.yaml): POST /api/clients requires only firstName/lastName —
   * neither date_of_birth nor primary_contact_phone is an AxisCare technical requirement, and no
   * documented current Serve business/regulatory rule was found to justify hard-blocking on
   * them either. See lib/assessmentIntelligence/axiscareReadiness.ts's `recommendedMissing`. */
  recommendedForAxisCare?: boolean;
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
  { fieldPath: "identity.date_of_birth", domain: "identity", label: "Date of birth", recommendedForAxisCare: true },
  { fieldPath: "identity.phone", domain: "identity", label: "Phone" },
  { fieldPath: "identity.email", domain: "identity", label: "Email" },

  // Residence
  { fieldPath: "residence.address_line1", domain: "residence", label: "Address" },
  { fieldPath: "residence.apartment_unit", domain: "residence", label: "Apartment / unit" },
  { fieldPath: "residence.community", domain: "residence", label: "Community" },
  { fieldPath: "residence.residence_type", domain: "residence", label: "Residence type" },
  // Full-address components (Assessment Contract / Coverage slice,
  // 2026-09-15) — surfaced together, via the coverage computation's
  // "not a recognized partner community" conditional, as an all-of group
  // with address_line1 (apartment/unit is real but optional detail, not
  // part of what makes an address complete — see coverage.ts).
  { fieldPath: "residence.city", domain: "residence", label: "City" },
  { fieldPath: "residence.state", domain: "residence", label: "State" },
  { fieldPath: "residence.postal_code", domain: "residence", label: "Postal code" },

  // Important People
  { fieldPath: "important_people.primary_contact_name", domain: "important_people", label: "Primary contact", requiredForReview: true },
  { fieldPath: "important_people.primary_contact_relationship", domain: "important_people", label: "Relationship to person" },
  { fieldPath: "important_people.primary_contact_phone", domain: "important_people", label: "Primary contact phone", recommendedForAxisCare: true },
  { fieldPath: "important_people.decision_maker", domain: "important_people", label: "Decision maker" },
  // Conditional on a POA being mentioned, as an all-of group with
  // decision_maker above (name AND relationship AND phone, not any one
  // alone) — see coverage.ts.
  { fieldPath: "important_people.decision_maker_relationship", domain: "important_people", label: "Decision maker's relationship to person" },
  { fieldPath: "important_people.decision_maker_phone", domain: "important_people", label: "Decision maker phone" },
  { fieldPath: "important_people.emergency_contact", domain: "important_people", label: "Emergency contact" },
  // Core, all-of with physician_phone below (both, not either) — see coverage.ts.
  { fieldPath: "important_people.physician_name", domain: "important_people", label: "Physician name" },
  { fieldPath: "important_people.physician_phone", domain: "important_people", label: "Physician phone" },

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
  // Conditional on medication_reminders being needed at all — see
  // coverage.ts's "medication reminders needed" trigger. Free text (the
  // schedule / who sets pills up), not yes/no.
  { fieldPath: "daily_life.medication_timing", domain: "daily_life", label: "Medication timing" },
  { fieldPath: "daily_life.medication_setup", domain: "daily_life", label: "Medication setup" },
  // Client Readiness taxonomy delta ("Client Readiness — Phase A.2
  // Architecture Lock" / Phase B, §5/§8): closes the one real §301(b) gap
  // — "supplies and equipment to be utilized" — for care-task supplies
  // beyond the mobility-specific equipment already captured below
  // (walker/cane/wheelchair/shower_equipment). Free text, not an
  // exhaustive checklist, and not required for review (conditional by
  // nature).
  { fieldPath: "daily_life.other_supplies_equipment", domain: "daily_life", label: "Other supplies or equipment used for care" },

  // Mobility / Safety
  { fieldPath: "mobility_safety.recent_falls", domain: "mobility_safety", label: "Recent falls", isBoolean: true, requiredForReview: true },
  { fieldPath: "mobility_safety.gait_steadiness", domain: "mobility_safety", label: "Gait / steadiness" },
  { fieldPath: "mobility_safety.walker", domain: "mobility_safety", label: "Walker", isBoolean: true },
  { fieldPath: "mobility_safety.cane", domain: "mobility_safety", label: "Cane", isBoolean: true },
  { fieldPath: "mobility_safety.wheelchair", domain: "mobility_safety", label: "Wheelchair", isBoolean: true },
  { fieldPath: "mobility_safety.shower_equipment", domain: "mobility_safety", label: "Shower equipment", isBoolean: true },
  { fieldPath: "mobility_safety.environmental_concerns", domain: "mobility_safety", label: "Environmental concerns" },
  // Conditional on transfers being needed together with a reduced-mobility
  // signal (recent falls or an existing mobility device) — see coverage.ts.
  { fieldPath: "mobility_safety.transfer_lift_equipment", domain: "mobility_safety", label: "Transfer / lift equipment" },

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
  // Conditional alongside wandering on a cognition concern — see coverage.ts.
  { fieldPath: "cognition.behavior_concerns", domain: "cognition", label: "Behavior concerns" },
  { fieldPath: "cognition.known_diagnosis", domain: "cognition", label: "Known cognitive diagnosis (explicitly stated)" },

  // Health
  // Relabeled per the Client Readiness taxonomy delta — the intent is
  // health conditions materially relevant to how Serve provides
  // non-medical PAS care, never comprehensive diagnosis collection. The
  // field_path itself is unchanged (no churn to already-recorded facts);
  // the extraction-prompt guidance that actually shapes what gets
  // captured lives outside this registry and is not touched here.
  { fieldPath: "health.diagnoses", domain: "health", label: "Health conditions relevant to care" },
  { fieldPath: "health.allergies", domain: "health", label: "Allergies", requiredForReview: true },
  { fieldPath: "health.recent_hospitalization", domain: "health", label: "Recent hospitalization / rehab", isBoolean: true },
  { fieldPath: "health.blood_thinners", domain: "health", label: "Blood thinners", isBoolean: true },
  { fieldPath: "health.oxygen", domain: "health", label: "Oxygen", isBoolean: true },
  { fieldPath: "health.dietary_restrictions", domain: "health", label: "Dietary restrictions" },
  // Core, unconditional — simple universal safety questions that
  // shouldn't depend on correctly recognizing another trigger first (see
  // coverage.ts).
  { fieldPath: "health.swallowing_risk", domain: "health", label: "Swallowing risk", isBoolean: true },
  // Core, unconditional — see coverage.ts. Free text (what the precaution
  // actually is), not yes/no.
  { fieldPath: "health.precautions_restrictions", domain: "health", label: "Precautions / restrictions" },

  // Advance Planning
  { fieldPath: "advance_planning.dnr", domain: "advance_planning", label: "DNR", isBoolean: true },
  { fieldPath: "advance_planning.advance_directive", domain: "advance_planning", label: "Advance directive", isBoolean: true },
  { fieldPath: "advance_planning.medical_poa", domain: "advance_planning", label: "Medical POA", isBoolean: true },
  // Client Readiness taxonomy delta: financial POA does not bear on safe/
  // effective non-medical PAS care or ISP content — it remains in the
  // registry (may still matter elsewhere, e.g. billing authorization) but
  // must never gate CR_ASSESSMENT_CURRENT's completeness.
  { fieldPath: "advance_planning.financial_poa", domain: "advance_planning", label: "Financial POA", isBoolean: true },

  // When
  { fieldPath: "when.desired_start_timing", domain: "when", label: "Desired start timing", requiredForReview: true },
  { fieldPath: "when.preferred_days", domain: "when", label: "Preferred days" },
  { fieldPath: "when.preferred_time_windows", domain: "when", label: "Preferred time windows" },
  { fieldPath: "when.frequency", domain: "when", label: "Frequency" },
  { fieldPath: "when.duration", domain: "when", label: "Duration" },

  // Serve Relationship Intelligence — genuinely useful for Serve's own
  // sales/relationship pipeline, but not part of "the minimum sufficient
  // care picture." Client Readiness taxonomy delta: these 4 fields, plus
  // what_why.why_now and what_why.acceptance_of_care above, must never
  // gate CR_ASSESSMENT_CURRENT's completeness — their absence is never a
  // Client Readiness concern. what_why.primary_goals is the one what_why
  // field that IS care/service-plan relevant and stays in scope.
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

export function recommendedForAxisCareFields(): FieldDefinition[] {
  return FIELD_REGISTRY.filter((f) => f.recommendedForAxisCare);
}
