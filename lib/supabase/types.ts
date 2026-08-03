// Recruiting leads

export type RecruitingLeadStatus =
  | "new"
  | "contacted"
  | "in_review"
  | "applied"
  | "not_a_fit"
  | "hired"
  | "archived";

export type RecruitingLeadRole = "caregiver" | "managing_director";

export interface RecruitingLead {
  id: string;
  created_at: string;
  role_interest: RecruitingLeadRole;
  source: string;
  status: RecruitingLeadStatus;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  zip_code: string | null;
  city_state: string | null;
  availability: string | null;
  experience_level: string | null;
  certification_license: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  resume_filename: string | null;
  resume_uploaded_at: string | null;
  exploration_timeline: string | null;
  message: string | null;
  raw_submission: Record<string, unknown> | null;
  form_started_at: string | null;
  form_completed_at: string | null;
  apploi_redirected_at: string | null;
}

export type RecruitingLeadInsert = Partial<
  Omit<RecruitingLead, "id" | "created_at">
>;

// ─── Workforce Identity ─────────────────────────────────────────────────
// See docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md Part 1 — a
// durable Serve workforce identity that survives beyond recruiting.
// Deliberately minimal: no name/contact/HR fields live here, only the
// link back to the recruiting lead that originated it.
// The canonical profile's review lifecycle — see
// supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
// 'reviewed' and 'locked' both mean AxisCare sync may never again silently
// overwrite the profile's canonical fields (a differing source value
// creates a discrepancy instead) — 'locked' additionally refuses ordinary
// human edits too, until explicitly unlocked.
export type WorkforceCanonicalProfileStatus = "unreviewed" | "reviewed" | "needs_review" | "locked";

export interface WorkforceMember {
  id: string;
  // Nullable: most/all AxisCare-synced caregivers were hired before Serve
  // OS's recruiting pipeline existed, or applied via Apploi directly (which
  // never creates a recruiting_leads row today). See
  // supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql.
  source_recruiting_lead_id: string | null;
  // Canonical identity — see
  // supabase/migrations/20260812000000_add_workforce_member_canonical_identity.sql
  // and 20260813000000_add_canonical_workforce_profile_editor.sql.
  // Initialized once at creation (from the recruiting lead, or from the
  // approved AxisCare source data for a standalone member) and edited only
  // through update_workforce_canonical_profile() thereafter — AxisCare/the
  // recruiting lead remain the source of attribution, never a second
  // silently-overwriting name source. display_name is never null
  // (DB-enforced); every other identity field may be null when neither a
  // human nor a source has provided it.
  display_name: string;
  legal_first_name: string | null;
  legal_middle_name: string | null;
  legal_last_name: string | null;
  preferred_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  canonical_profile_status: WorkforceCanonicalProfileStatus;
  canonical_identity_notes: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
}

// ─── Multi-community foundation ───────────────────────────────────────────
// See supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
// The first normalized Community entity in Serve OS — every other domain
// still uses a free-text community_name/community_code pair (residents,
// relationships), untouched by this migration.
export interface Community {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export type WorkforceCommunityMembershipStatus = "pending" | "active" | "inactive" | "terminated" | "transferred";

// "Jessicah exists as a Serve workforce member" (workforce_members) is
// distinct from "Jessicah currently works at Watermere" (this table). One
// workforce member, any number of community memberships — never a second
// workforce_members row for the same person working at another community.
export interface WorkforceCommunityMembership {
  id: string;
  workforce_member_id: string;
  community_id: string;
  membership_status: WorkforceCommunityMembershipStatus;
  role_type: string | null;
  employment_relationship: string | null;
  start_date: string | null;
  end_date: string | null;
  is_primary_community: boolean;
  community_display_name_override: string | null;
  community_email: string | null;
  community_phone: string | null;
  scheduler_notes: string | null;
  availability_notes: string | null;
  transportation_notes: string | null;
  access_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string | null;
}

// ─── Canonical profile audit trail ────────────────────────────────────────
export type WorkforceProfileChangeType =
  | "canonical_correction"
  | "preferred_value_change"
  | "community_override"
  | "profile_reviewed"
  | "profile_unlocked"
  | "profile_locked"
  | "discrepancy_flagged"
  | "discrepancy_resolved";

// Append-only — one row per changed field per save. Distinct from
// person_vendor_identity_link_decisions (20260811000000): that table
// tracks identity-LINK decisions (which vendor record is primary/
// confirmed); this one tracks canonical PROFILE field values themselves.
export interface WorkforceProfileChange {
  id: string;
  workforce_member_id: string;
  community_id: string | null;
  field_name: string;
  previous_value: string | null;
  new_value: string | null;
  change_type: WorkforceProfileChangeType;
  actor: string;
  rationale: string | null;
  created_at: string;
}

export type WorkforceProfileDiscrepancyStatus = "open" | "accepted_source" | "retained_canonical" | "dismissed";

// "Source differs from reviewed canonical value -> create discrepancy."
// One open row per workforce_member_id + field_name at a time (DB-enforced
// partial unique index) — a later sync refresh updates the same open row
// rather than piling up duplicates.
export interface WorkforceProfileDiscrepancy {
  id: string;
  workforce_member_id: string;
  field_name: string;
  canonical_value: string | null;
  source_value: string | null;
  source_system: string;
  status: WorkforceProfileDiscrepancyStatus;
  detected_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_rationale: string | null;
}

// ─── Workforce Intelligence Phase 1 — platform-owned compliance layer ─────
// See docs/intelligence/SERVE_HUMAN_LIFECYCLE_ONTOLOGY.md and
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql.
// Hierarchy: Subject -> Requirement Set -> Requirements -> Evidence ->
// Verification -> Compliance Status (lib/compliance/requirementSetStatus.ts)
// -> Domain Interpretation (lib/workforce/registryReadiness.ts).
//
// subject_type is a closed, controlled vocabulary — only 'workforce_member'
// today. Adding a second value is always a migration (new CHECK constraint
// branch) plus a new branch in assert_valid_person_subject() — the two
// travel together, by convention, so they can never drift.
export type PersonSubjectType = "workforce_member";

export const SUBJECT_TYPE_WORKFORCE_MEMBER: PersonSubjectType = "workforce_member";

// The same 7-tier match ladder originally proven by Recruiting's
// lead-to-vendor-record matching, reused unchanged for AxisCare caregiver
// identity resolution below — one shared vocabulary, not a workforce-only
// reinvention.
export type VendorIdentityMatchMethod =
  | "existing_linkage"
  | "vendor_id"
  | "verified_email"
  | "verified_phone"
  | "verified_email_or_phone_plus_name"
  | "normalized_name_plus_attribute"
  | "name_similarity_pending_review";

export type VendorIdentityMatchConfidence = "high" | "medium" | "low";

export type PersonVendorIdentityLinkStatus = "proposed" | "confirmed" | "rejected" | "deferred";

// link_role only ever applies once status = 'confirmed' — see
// supabase/migrations/20260811000000_add_vendor_identity_lineage.sql.
//   primary    — the current, profile/lifecycle-driving record for this
//                subject+source. At most one, DB-enforced.
//   duplicate  — confirmed same person, kept in sync, not profile-driving.
//   retired    — explicitly retired from active tracking by a reviewer.
//   historical — reserved for future lineage use; no Phase 1 action assigns
//                this value yet.
export type LinkRole = "primary" | "duplicate" | "retired" | "historical";

export interface PersonVendorIdentityLink {
  id: string;
  subject_type: PersonSubjectType;
  subject_id: string | null;
  source_system: string;
  vendor_record_id: string;
  vendor_display_name: string | null;
  match_method: VendorIdentityMatchMethod;
  match_confidence: VendorIdentityMatchConfidence;
  status: PersonVendorIdentityLinkStatus;
  link_role: LinkRole | null;
  duplicate_of_link_id: string | null;
  approved_source_data: Record<string, unknown>;
  last_synced_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_rationale: string | null;
  created_at: string;
  updated_at: string;
}

// Append-only — every human decision made on a PersonVendorIdentityLink,
// preserved even after later corrections. See
// supabase/migrations/20260811000000_add_vendor_identity_lineage.sql's
// person_vendor_identity_link_decisions. System-generated proposals (from
// the AxisCare sync) are not logged here — only human decisions are.
export type PersonVendorIdentityLinkDecisionAction =
  | "confirmed"
  | "rejected"
  | "deferred"
  | "reopened"
  | "role_changed"
  | "subject_reassigned";

export interface PersonVendorIdentityLinkDecision {
  id: string;
  link_id: string;
  action: PersonVendorIdentityLinkDecisionAction;
  previous_status: PersonVendorIdentityLinkStatus | null;
  new_status: PersonVendorIdentityLinkStatus | null;
  previous_link_role: LinkRole | null;
  new_link_role: LinkRole | null;
  previous_subject_id: string | null;
  new_subject_id: string | null;
  actor: string;
  rationale: string;
  created_at: string;
}

export interface RequirementSet {
  id: string;
  set_code: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonRequirement {
  id: string;
  requirement_code: string;
  name: string;
  description: string | null;
  category: string;
  requires_document: boolean;
  requires_verification: boolean;
  is_active: boolean;
  // Employee Record Audit — score-gated requirements only (HIPAA/HB300,
  // Infection Control training). Null for every requirement that isn't
  // score-gated. See supabase/migrations/20260814000000_add_employee_record_audit.sql.
  required_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface RequirementSetMember {
  id: string;
  requirement_set_id: string;
  requirement_id: string;
  is_required: boolean;
  sort_order: number;
  created_at: string;
}

export type PersonDocumentStatus = "active" | "superseded";

export interface PersonDocument {
  id: string;
  subject_type: PersonSubjectType;
  subject_id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  document_type: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  document_date: string | null;
  source_system: string;
  uploaded_by: string;
  uploaded_at: string;
  is_sensitive: boolean;
  status: PersonDocumentStatus;
  checksum: string | null;
  supersedes_document_id: string | null;
  created_at: string;
  updated_at: string;
}

// Two independent dimensions — deliberately never collapsed into one. See
// supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql's
// comment on person_evidence.verification_status/lifecycle_status.
//
// verification_status: was this evidence reviewed and found correct? A
// human judgment, set exactly once (verified/rejected) and never
// overwritten by a later lifecycle event.
export type PersonEvidenceVerificationStatus = "unverified" | "verified" | "rejected";

// lifecycle_status: is this evidence still the current record for its
// requirement? Changes over time (expiration, supersession, or — Evidence
// Management — a correction) without ever touching the verification
// judgment above. 'entered_in_error' is distinct from 'superseded': a
// superseded record was correct when created and later replaced by newer
// evidence; an entered-in-error record should never have existed for this
// subject/requirement at all (wrong caregiver, wrong requirement, duplicate).
export type PersonEvidenceLifecycleStatus = "active" | "expired" | "superseded" | "entered_in_error";

export type PersonEvidenceResult =
  | "no_record_returned"
  | "listed_no_findings"
  | "listed_with_findings"
  | "requires_review"
  | "unable_to_determine";

// Human Attestation & Evidence Assurance (Phase 1D) — see
// supabase/migrations/20260817000000_add_human_attestation.sql. Three
// deliberately distinct concepts; never collapse one into another:
//   - WHERE the fact lives (authoritative source system)
//   - HOW Serve OS came to have this evidence (collection method)
//   - HOW that collection was itself verified (verification method)
export type AuthoritativeSourceSystem =
  | "viventium"
  | "axiscare"
  | "texas_nar"
  | "semarc"
  | "background_vendor"
  | "uploaded_document"
  | "other_authorized_source";

export type EvidenceCollectionMethod =
  | "human_attestation"
  | "api_sync"
  | "structured_import"
  | "document_upload"
  | "digital_compatriot_observation";

export type EvidenceVerificationMethod =
  | "direct_source_review"
  | "document_review"
  | "imported_authoritative_status"
  | "automated_source_confirmation";

// The structured "what was observed" outcome for a Human Attestation —
// deliberately a superset covering both generic verification outcomes and
// the E-Verify-specific set (completed_closed/pending/case_not_found) the
// product mission names explicitly. Whether a given value counts as
// "satisfies the requirement" is a per-requirement decision made in
// lib/workforce/humanAttestation.ts, never assumed centrally.
export type AttestationResult =
  | "verified"
  | "verified_with_observation"
  | "completed_closed"
  | "pending"
  | "case_not_found"
  | "unable_to_verify"
  | "contradictory"
  | "requires_review"
  | "not_found"
  | "unknown";

export interface PersonEvidence {
  id: string;
  subject_type: PersonSubjectType;
  subject_id: string;
  requirement_id: string;
  document_id: string | null;
  verification_status: PersonEvidenceVerificationStatus;
  lifecycle_status: PersonEvidenceLifecycleStatus;
  // Populated together, exactly when lifecycle_status moves off 'active' —
  // never when verification_status changes. See the migration's
  // person_evidence_lifecycle_status_fields_check.
  lifecycle_status_reason: string | null;
  lifecycle_status_changed_by: string | null;
  lifecycle_status_changed_at: string | null;
  result: PersonEvidenceResult | null;
  source_system: string;
  performed_at: string | null;
  effective_date: string | null;
  review_due_date: string | null;
  expiration_date: string | null;
  entered_by: string;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  supersedes_evidence_id: string | null;
  // Employee Record Audit — the score a score-gated requirement's evidence
  // was verified with (e.g. a training completion score). Null unless the
  // requirement being satisfied has a required_score. See
  // supabase/migrations/20260814000000_add_employee_record_audit.sql.
  numeric_score: number | null;
  // Human Attestation & Evidence Assurance — see
  // supabase/migrations/20260817000000_add_human_attestation.sql. All four
  // null except on rows collected via Human Attestation (or, in future, a
  // Digital Compatriot observation).
  authoritative_source_system: AuthoritativeSourceSystem | null;
  collection_method: EvidenceCollectionMethod | null;
  verification_method: EvidenceVerificationMethod | null;
  attestation_result: AttestationResult | null;
  external_reference: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkforceActivityEventType =
  | "workforce_profile_created"
  | "identity_link_confirmed"
  | "axiscare_source_data_refreshed"
  | "document_uploaded"
  | "evidence_created"
  | "evidence_verified"
  | "evidence_rejected"
  // Evidence Management — see
  // supabase/migrations/20260808000000_create_workforce_intelligence_platform.sql's
  // workforce_activity_event_type_check and lib/workforce/evidenceLifecycle.ts.
  | "document_metadata_corrected"
  | "document_reassigned"
  | "accidental_upload_removed"
  | "evidence_corrected"
  | "evidence_marked_entered_in_error"
  | "evidence_replaced"
  | "evidence_renewed"
  // Vendor Identity Lineage — see
  // supabase/migrations/20260811000000_add_vendor_identity_lineage.sql and
  // lib/data/personVendorIdentityLinks.ts.
  | "identity_link_reopened"
  | "identity_link_promoted_to_primary"
  | "identity_link_role_changed"
  | "identity_link_subject_reassigned"
  // Canonical Profile Editor — see
  // supabase/migrations/20260813000000_add_canonical_workforce_profile_editor.sql.
  | "canonical_profile_updated"
  | "canonical_profile_reviewed"
  | "canonical_profile_locked"
  | "canonical_profile_unlocked"
  | "community_membership_updated"
  | "profile_discrepancy_flagged"
  | "profile_discrepancy_resolved"
  // Employee Record Audit — see
  // supabase/migrations/20260814000000_add_employee_record_audit.sql.
  | "compliance_action_created"
  | "compliance_action_resolved"
  | "compliance_action_dismissed"
  // Human Attestation & Evidence Assurance — see
  // supabase/migrations/20260817000000_add_human_attestation.sql.
  | "evidence_attested";

export interface WorkforceActivityEvent {
  id: string;
  workforce_member_id: string;
  event_type: WorkforceActivityEventType;
  event_title: string;
  event_description: string | null;
  source: string;
  system_generated: boolean;
  created_by: string | null;
  created_at: string;
}

// ─── Employee Record Audit — operational work ──────────────────────────
// See supabase/migrations/20260814000000_add_employee_record_audit.sql.
// Deliberately Workforce-domain-scoped (workforce_member_id, not a
// polymorphic subject) — the smallest structure this product needs, not a
// platform-wide action primitive built ahead of a second consumer.
export type WorkforceComplianceActionType =
  | "evidence_missing"
  | "evidence_expired"
  | "evidence_expiring_soon"
  | "evidence_requires_review"
  // Attention-Driven Operations (Phase 1C) — see
  // supabase/migrations/20260815000000_add_attention_driven_operations.sql.
  | "evidence_awaiting_verification";

export type WorkforceComplianceActionPriority = "low" | "normal" | "high" | "urgent";

export type WorkforceComplianceActionStatus = "open" | "resolved" | "dismissed";

export interface WorkforceComplianceAction {
  id: string;
  workforce_member_id: string;
  requirement_id: string | null;
  action_type: WorkforceComplianceActionType;
  title: string;
  reason: string;
  owner: string | null;
  priority: WorkforceComplianceActionPriority;
  due_at: string | null;
  status: WorkforceComplianceActionStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type WorkforceAxisCareSyncRunStatus = "in_progress" | "success" | "failed" | "partial";

export interface WorkforceAxisCareSyncRun {
  id: string;
  status: WorkforceAxisCareSyncRunStatus;
  started_at: string;
  completed_at: string | null;
  records_received: number;
  source_records_refreshed: number;
  source_records_unchanged: number;
  review_candidates_created: number;
  errors: unknown[];
  initiated_by: string;
}

// Prospects

export type ProspectStatus =
  | "new"
  | "reviewing"
  | "contacted"
  | "assessment_scheduled"
  | "converted"
  | "closed";

export type IntakeCurrentStep =
  | "started"
  | "contact_completed"
  | "relationship_completed"
  | "support_completed"
  | "timing_completed"
  | "referral_completed"
  | "completed";

export interface Prospect {
  id: string;
  created_at: string;
  status: ProspectStatus;
  source: string | null;
  inquiry_type: string | null;
  care_recipient_first_name?: string | null;
  care_recipient_last_name?: string | null;
  zip_code: string | null;
  resident_first_name: string | null;
  resident_last_name: string | null;
  resident_relationship: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  support_type: string | null;
  start_timing: string | null;
  care_needs: string | null;
  referral_source: string | null;
  consent_given: boolean | null;
  current_step?: IntakeCurrentStep | null;
  intake_started_at?: string | null;
  contact_information_completed_at?: string | null;
  assessment_started_at?: string | null;
  assessment_completed_at?: string | null;
  intake_completed_at?: string | null;
  raw_submission: Record<string, unknown> | null;
}

export type ProspectInsert = Partial<Omit<Prospect, "id" | "created_at">>;

// Website Intake Submissions — the canonical raw intake source for the
// Serve Intake Intelligence Engine (see
// docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md). Immutable provenance:
// the engine reads this table but never writes to it beyond the initial
// insert (which happens outside serve-os, by the website's own intake
// function). `form_payload` carries the full raw form submission
// (including fields this table's normalized columns don't capture);
// normalized columns are a convenience projection of the most common
// fields, not a second source of truth independent of form_payload.
export type WebsiteIntakeType =
  | "family_care_inquiry"
  | "professional_referral"
  | "employment_interest"
  | "outside_service_area";

export interface IntakeSubmission {
  id: string;
  created_at: string;
  intake_type: string;
  source: string;
  status: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  zip: string | null;
  community: string | null;
  city: string | null;
  form_payload: Record<string, unknown> | null;
  outside_service_area: boolean;
  // Caller-supplied idempotency key (Scope J) — distinct from `id`, which
  // is server-generated. Null for rows created before this key existed.
  client_submission_id: string | null;
}

// Conversation telemetry (Scope J) — optional product-experience layer for
// interactive intake journeys (e.g. the /get-started wizards). See
// docs/integrations/WEBSITE_TO_SERVE_INTAKE_CONTRACT.md.
export type ConversationContactCaptureStatus =
  | "none"
  | "partial_contact_captured"
  | "consented_for_followup"
  | "completed";

export interface ConversationSession {
  id: string;
  session_key: string;
  experience_type: string;
  source: string;
  channel_version: string;
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
  highest_step_reached: string | null;
  final_submission_id: string | null;
  contact_capture_status: ConversationContactCaptureStatus;
  draft_contact_name: string | null;
  draft_contact_phone: string | null;
  draft_contact_email: string | null;
  draft_inquiry_summary: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationEventType =
  | "conversation_started"
  | "step_viewed"
  | "step_completed"
  | "contact_information_entered"
  | "validation_failed"
  | "back_navigation"
  | "submission_attempted"
  | "submission_succeeded"
  | "submission_failed";

export interface ConversationEvent {
  id: string;
  session_id: string;
  event_type: ConversationEventType;
  step_key: string | null;
  step_sequence: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Intake Processing Records — the mutable operational-metadata layer the
// Serve Intake Intelligence Engine writes (see
// docs/design/SERVE_INTAKE_INTELLIGENCE_ENGINE.md). One row per source
// submission (unique on intake_source + source_submission_id).
export type IntakeProcessingStatus = "needs_review" | "processed" | "failed" | "not_qualified";

export type IntakeClassificationValue =
  | "resident_prospect"
  | "external_prospect"
  | "professional_relationship"
  | "recruiting"
  | "needs_review"
  | "not_qualified";

export interface IntakeProcessingRecord {
  id: string;
  intake_source: string;
  source_submission_id: string;
  source_table: string;
  intake_type: string;
  processing_status: IntakeProcessingStatus;
  classification: IntakeClassificationValue | null;
  confidence_score: number | null;
  confidence_band: string | null;
  reason_codes: string[];
  processing_notes: string | null;
  normalized_envelope: Record<string, unknown> | null;
  relationship_id: string | null;
  resident_id: string | null;
  external_client_id: string | null;
  recruiting_lead_id: string | null;
  first_action_id: string | null;
  processing_version: string;
  processed_by: string;
  processing_started_at: string | null;
  processed_at: string | null;
  last_error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

// Residents

export type ServeRelationshipStatus =
  | "none"
  | "prospect"
  | "active_client"
  | "hold"
  | "former_client"
  | "wellness_watch";

export interface Resident {
  id: string;
  external_source_key: string | null;
  community_name: string | null;
  community_code: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  display_name: string | null;
  full_name: string | null;
  status: string | null;
  relationship_status: string | null;
  serve_relationship_status: ServeRelationshipStatus | null;
  resident_type: string | null;
  building: string | null;
  unit_number: string | null;
  email: string | null;
  phone: string | null;
  phone_raw: string | null;
  phone_type: string | null;
  date_of_birth: string | null;
  date_of_admission: string | null;
  mobility: string | null;
  preferred_language: string | null;
  sex: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip_code: string | null;
  care_needs: string | null;
  family_contact_name: string | null;
  family_contact_relationship: string | null;
  family_contact_phone: string | null;
  family_contact_email: string | null;
  source_system: string | null;
  source_file: string | null;
  source_status: string | null;
  notes: string | null;
  needs_review: string | null;
  import_batch: string | null;
  created_at: string;
  updated_at: string | null;
  is_active: boolean | null;
}

export interface ResidentRelationshipImport {
  id?: string | null;
  resident_id?: string | null;
  external_source_key?: string | null;
  resident_external_source_key?: string | null;
  source_resident_id?: string | null;
  resident_source_id?: string | null;
  resident_name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  unit_number?: string | null;
  unit?: string | null;
  apartment?: string | null;
  source_system?: string | null;
  serve_relationship_status?: ServeRelationshipStatus | null;
  source_status?: string | null;
  relationship_status?: string | null;
  status?: string | null;
  cinch_status?: string | null;
  service_type?: string | null;
  service_model?: string | null;
  care_model?: string | null;
  notes?: string | null;
  review_notes?: string | null;
  effective_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  imported_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  raw_data?: Record<string, unknown> | null;
}

// Connections — resident relationship-memory foundation.
// Not a lead-nurture, sales, campaign, or marketing system. Applies to all
// Watermere residents, including non-clients.

export type RelationshipStage =
  | "unknown"
  | "introduced"
  | "acquaintance"
  | "familiar"
  | "established_relationship";

export interface ResidentRelationshipProfile {
  id: string;
  resident_id: string;
  preferred_name: string | null;
  conversation_style: string | null;
  communication_preference: string | null;
  preferred_contact_channel: string | null;
  best_time_to_contact: string | null;
  relationship_stage: RelationshipStage;
  relationship_owner_user_id: string | null;
  last_meaningful_touch_at: string | null;
  next_suggested_touch_at: string | null;
  general_notes: string | null;
  do_not_contact: boolean;
  created_at: string;
  updated_at: string;
}

export type ResidentRelationshipProfileInsert = Partial<
  Omit<ResidentRelationshipProfile, "id" | "created_at" | "updated_at">
> & { resident_id: string };

export type InterestType =
  | "college"
  | "sports_team"
  | "hobby"
  | "former_profession"
  | "military_service"
  | "hometown"
  | "travel"
  | "music"
  | "books"
  | "pets"
  | "family"
  | "community_activity"
  | "food"
  | "faith_or_tradition"
  | "conversation_topic"
  | "other";

export type ConnectionSourceType =
  | "resident_shared"
  | "family_shared"
  | "staff_observation"
  | "staff_conversation"
  | "imported"
  | "other";

export type InterestConfidence = "unconfirmed" | "probable" | "confirmed";

export type InterestSensitivity = "standard" | "sensitive" | "high";

export interface ResidentInterest {
  id: string;
  resident_id: string;
  interest_type: InterestType;
  interest_value: string;
  details: string | null;
  source_type: ConnectionSourceType;
  source_note: string | null;
  confidence: InterestConfidence;
  sensitivity: InterestSensitivity;
  confirmed_by_resident: boolean;
  supports_future_touch: boolean;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ResidentInterestInsert = Partial<
  Omit<ResidentInterest, "id" | "created_at" | "updated_at">
> & { resident_id: string; interest_type: InterestType; interest_value: string };

export type MilestoneType =
  | "birthday"
  | "wedding_anniversary"
  | "military_anniversary"
  | "graduation"
  | "move_in_anniversary"
  | "bereavement_remembrance"
  | "religious_observance"
  | "personal_accomplishment"
  | "custom";

export interface ResidentMilestone {
  id: string;
  resident_id: string;
  milestone_type: MilestoneType;
  title: string;
  event_date: string | null;
  month: number | null;
  day: number | null;
  year_known: boolean;
  recurs_annually: boolean;
  source_type: ConnectionSourceType;
  confirmed: boolean;
  appropriate_for_outreach: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ResidentMilestoneInsert = Partial<
  Omit<ResidentMilestone, "id" | "created_at" | "updated_at">
> & { resident_id: string; milestone_type: MilestoneType; title: string };

export type TouchType =
  | "birthday"
  | "anniversary"
  | "holiday"
  | "sports"
  | "interest"
  | "welcome"
  | "check_in"
  | "congratulations"
  | "sympathy"
  | "community_event"
  | "personal_follow_up"
  | "just_because";

export type TouchStatus =
  | "suggested"
  | "scheduled"
  | "drafted"
  | "approved"
  | "completed"
  | "sent"
  | "dismissed"
  | "cancelled";

export type TouchChannel =
  | "in_person"
  | "phone"
  | "text"
  | "email"
  | "card"
  | "gift"
  | "other";

export interface ResidentTouch {
  id: string;
  resident_id: string;
  touch_type: TouchType;
  status: TouchStatus;
  channel: TouchChannel;
  scheduled_for: string | null;
  completed_at: string | null;
  completed_by: string | null;
  subject: string | null;
  message_text: string | null;
  reason: string | null;
  source_rule: string | null;
  requires_review: boolean;
  approved_by: string | null;
  sent_at: string | null;
  external_message_id: string | null;
  resident_response: string | null;
  outcome: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export type ResidentTouchInsert = Partial<
  Omit<ResidentTouch, "id" | "created_at" | "updated_at">
> & { resident_id: string; touch_type: TouchType };

// Wellness Notes — a time-based operational observation timeline. Distinct
// from Connections (relationship memory) and resident_touches (relationship
// outreach): a wellness note is not a touch, interest, milestone, assessment,
// or completed care visit.
//
// A wellness note represents one operational event. One event may affect
// multiple wellness domains, so classification lives in `signals` (many per
// note) rather than a single required type. `primary_domain` is an optional,
// coarse label only — never the sole classification.

export type WellnessPrimaryDomain =
  | "general_wellness"
  | "mobility"
  | "fall_risk"
  | "medication"
  | "nutrition_hydration"
  | "mood_behavior"
  | "cognition"
  | "sleep"
  | "personal_care"
  | "environment_safety"
  | "social_engagement"
  | "family_update"
  | "hospital_rehab"
  | "other";

export type WellnessSignalType =
  | "general_wellness"
  | "mobility"
  | "fall_risk"
  | "injury"
  | "pain"
  | "medication"
  | "nutrition_hydration"
  | "cognition"
  | "mood_behavior"
  | "sleep"
  | "personal_care"
  | "continence"
  | "sensory_change"
  | "hospital_rehab"
  | "surgery_procedure"
  | "return_from_rehab"
  | "change_in_service_need"
  | "environment_safety"
  | "bathroom_safety"
  | "equipment"
  | "home_modification"
  | "accessibility"
  | "social_engagement"
  | "isolation"
  | "family_update"
  | "resident_preference"
  | "care_resistance"
  | "missed_task"
  | "caregiver_concern"
  | "follow_up_needed"
  | "other";

export type WellnessNotePriority =
  | "routine"
  | "monitor"
  | "important"
  | "urgent";

export type WellnessNoteSourceSystem =
  | "serve_os"
  | "cinch_ccm"
  | "axiscare"
  | "assessment"
  | "family"
  | "community_staff"
  | "other";

export interface ResidentWellnessNoteSignal {
  id: string;
  wellness_note_id: string;
  signal_type: WellnessSignalType;
  created_at: string;
}

export type ResidentWellnessNoteSignalInsert = {
  wellness_note_id: string;
  signal_type: WellnessSignalType;
};

export interface ResidentWellnessNote {
  id: string;
  resident_id: string;
  observed_at: string;
  primary_domain: WellnessPrimaryDomain | null;
  observation: string;
  context: string | null;
  action_taken: string | null;
  follow_up_required: boolean;
  follow_up_date: string | null;
  priority: WellnessNotePriority;
  source_system: WellnessNoteSourceSystem;
  source_record_id: string | null;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
  signals: WellnessSignalType[];
  // Count of follow-up records generated from this observation (any status).
  // A relationship indicator only — full records are not embedded here.
  followUpCount: number;
}

// Wellness Follow-Ups — the "what should happen next" layer. A follow-up is
// a separate, trackable operational object, never free text embedded
// permanently inside a wellness observation. One observation may create
// zero, one, or many follow-ups.

export type WellnessFollowUpType =
  | "reassessment"
  | "resident_check_in"
  | "family_update"
  | "safety_review"
  | "medication_review"
  | "mobility_review"
  | "equipment_review"
  | "care_coordination"
  | "service_review"
  | "documentation"
  | "other";

export type WellnessFollowUpStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "dismissed"
  | "cancelled";

export type WellnessFollowUpSourceType =
  | "wellness_observation"
  | "assessment"
  | "current_status"
  | "service_plan"
  | "imported_note"
  | "manual"
  | "system_rule";

export type WellnessFollowUpSuggestedBy = "manual" | "rule_engine";

export interface ResidentWellnessFollowUp {
  id: string;
  resident_id: string;
  source_type: WellnessFollowUpSourceType;
  source_id: string | null;
  title: string;
  description: string | null;
  follow_up_type: WellnessFollowUpType;
  due_at: string | null;
  assigned_to: string | null;
  priority: WellnessNotePriority;
  status: WellnessFollowUpStatus;
  suggested_by: WellnessFollowUpSuggestedBy;
  suggestion_rule_id: string | null;
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_note: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ResidentWellnessFollowUpEdit {
  id: string;
  follow_up_id: string;
  field_name: "title" | "description" | "follow_up_type" | "due_at" | "assigned_to" | "priority";
  old_value: string | null;
  new_value: string | null;
  edited_by: string;
  edited_at: string;
}

export type ResidentWellnessFollowUpInsert = Partial<
  Omit<ResidentWellnessFollowUp, "id" | "created_at" | "updated_at">
> & {
  resident_id: string;
  title: string;
  follow_up_type: WellnessFollowUpType;
};

// A deterministic, rule-engine-produced candidate — not yet accepted or
// saved. Purely computed client-side from selected signals; never persisted
// on its own.
export interface WellnessFollowUpSuggestion {
  ruleId: string;
  title: string;
  description: string | null;
  followUpType: WellnessFollowUpType;
  suggestedDueDays: number | null;
  priority: WellnessNotePriority;
  reason: string;
}

// A suggestion (or a manually-added custom follow-up) that staff explicitly
// accepted before save. ruleId is null for fully manual entries.
export interface AcceptedWellnessFollowUpInput {
  ruleId: string | null;
  title: string;
  description?: string | null;
  followUpType: WellnessFollowUpType;
  dueAt?: string | null;
  assignedTo?: string | null;
  priority: WellnessNotePriority;
}

// Input to the atomic create_resident_wellness_note_with_follow_ups() RPC —
// not a literal table-row shape, since signal_types and follow_ups span
// three tables in one call.
export interface CreateWellnessNoteFollowUpInput {
  title: string;
  description?: string | null;
  follow_up_type: WellnessFollowUpType;
  due_at?: string | null;
  assigned_to?: string | null;
  priority: WellnessNotePriority;
  suggested_by: WellnessFollowUpSuggestedBy;
  suggestion_rule_id?: string | null;
  created_by?: string | null;
}

export interface CreateWellnessNoteInput {
  resident_id: string;
  observed_at?: string;
  primary_domain?: WellnessPrimaryDomain | null;
  observation: string;
  context?: string | null;
  action_taken?: string | null;
  follow_up_required?: boolean;
  follow_up_date?: string | null;
  priority?: WellnessNotePriority;
  source_system?: WellnessNoteSourceSystem;
  source_record_id?: string | null;
  entered_by?: string | null;
  signal_types: WellnessSignalType[];
  follow_ups?: CreateWellnessNoteFollowUpInput[];
}

// Resident Current Needs — the first layer of resident memory. A concise,
// curated summary of what Serve staff should know before interacting with
// a resident, versioned so a save never silently overwrites what was
// documented before. See save_resident_current_needs() in
// 20260716000000_create_resident_current_needs.sql for how versions supersede
// one another.

export type ResidentCurrentNeedsSourceType =
  | "staff_entry"
  | "assessment"
  | "conversation"
  | "document_import"
  | "system";

export interface ResidentCurrentNeeds {
  id: string;
  residentId: string;
  content: string;
  versionNumber: number;
  sourceType: ResidentCurrentNeedsSourceType;
  sourceLabel: string | null;
  createdBy: string | null;
  createdAt: string;
  // Display-friendly author label — createdBy with a fallback for the rare
  // case a historical row has no actor recorded.
  authorName: string;
}

// Resident Working Notes — the second resident-memory layer. Temporary
// operational thoughts ("what is currently in motion?"), append-only:
// resolving/archiving updates the row in place rather than superseding it
// with a new one (contrast with Current Needs above). See
// 20260716020000_create_resident_working_notes.sql.

export type WorkingNoteCategory =
  | "operational"
  | "family"
  | "scheduling"
  | "sales"
  | "clinical"
  | "general";

export type WorkingNoteStatus = "open" | "resolved" | "archived";

export interface ResidentWorkingNote {
  id: string;
  residentId: string;
  content: string;
  category: WorkingNoteCategory | null;
  status: WorkingNoteStatus;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  archivedAt: string | null;
}

// Resident Timeline — the third resident-memory layer. Chronological,
// factual, append-only, and system generated only (no manual entry in this
// phase). See 20260716010000_create_resident_timeline.sql.

export type ResidentTimelineEventType =
  | "resident_created"
  | "current_needs_updated"
  | "working_note_created"
  | "working_note_resolved"
  | "relationship_conversion";

export interface ResidentTimelineEvent {
  id: string;
  residentId: string;
  eventType: ResidentTimelineEventType;
  eventTitle: string;
  eventDescription: string | null;
  source: string;
  createdAt: string;
  createdBy: string | null;
  systemGenerated: boolean;
}

export interface ResidentContactImport {
  id?: string | null;
  resident_id?: string | null;
  external_source_key?: string | null;
  resident_external_source_key?: string | null;
  source_resident_id?: string | null;
  resident_source_id?: string | null;
  resident_name?: string | null;
  resident_full_name?: string | null;
  resident_display_name?: string | null;
  resident_first_name?: string | null;
  resident_last_name?: string | null;
  resident_unit_number?: string | null;
  unit_number?: string | null;
  unit?: string | null;
  apartment?: string | null;
  contact_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  is_primary?: boolean | null;
  source_system?: string | null;
  imported_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  raw_data?: Record<string, unknown> | null;
}

// Relationship CRM foundation — see docs/design/RELATIONSHIPS.md.
// Resident = identity. Relationship = Serve's engagement with a person,
// family, or organization, which may exist with no resident at all (an
// external prospect) and may later be linked to one without losing
// history. Every actor field here is `text` (email/full name from
// getCurrentAuthorizedUser()), matching every other table in this app —
// there is no uuid staff identifier anywhere to reference.

export type RelationshipType =
  | "resident_prospect"
  | "external_prospect"
  | "active_client"
  | "former_client"
  | "referral_source"
  | "community_partner"
  | "professional_contact"
  | "other";

// Named PipelineStage, not RelationshipStage — that name is already taken
// above by resident_relationship_profiles.relationship_stage (a personal-
// closeness scale for Getting to Know: unknown/introduced/acquaintance/
// familiar/established_relationship). This is an unrelated concept: where
// a Relationship (the CRM entity) currently stands in Serve's engagement
// pipeline.
export type PipelineStage =
  | "new_inquiry"
  | "contact_attempted"
  | "connected"
  | "discovery"
  | "assessment_scheduled"
  | "assessment_completed"
  | "proposal_in_progress"
  | "proposal_sent"
  | "considering"
  | "follow_up_needed"
  | "ready_to_start"
  | "won"
  | "on_hold"
  | "closed_lost";

export type RelationshipStatus = "active" | "on_hold" | "closed";

export type RelationshipPriority = "low" | "normal" | "high" | "urgent";

export interface Relationship {
  id: string;
  relationship_type: RelationshipType;
  stage: PipelineStage;
  status: RelationshipStatus;
  display_name: string;
  resident_id: string | null;
  prospect_id: string | null;
  community_name: string | null;
  organization_name: string | null;
  primary_contact_name: string | null;
  primary_contact_relationship: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  prospective_resident_name: string | null;
  // Structured External Prospect identity — see docs/design/RELATIONSHIPS.md,
  // "External Prospect domain model." An External Prospect is defined by
  // an expected service location, not by the absence of a linked resident;
  // the prospective client and the primary contact may be the same person
  // or different people, tracked explicitly via
  // primary_contact_is_prospective_client rather than inferred.
  prospective_client_first_name: string | null;
  prospective_client_last_name: string | null;
  prospective_client_preferred_name: string | null;
  prospective_client_phone: string | null;
  prospective_client_email: string | null;
  primary_contact_is_prospective_client: boolean;
  summary: string | null;
  owner_label: string | null;
  priority: RelationshipPriority;
  source_type: string | null;
  source_label: string | null;
  last_meaningful_touch_at: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
  // Test-data hygiene only (docs/engineering/TEST_DATA_HYGIENE.md) — never
  // set or read by normal application UI. Identifies every row created by
  // a live-database verification run so scripts/cleanup-test-data.ts can
  // remove the whole run (root + every dependent record) deterministically.
  test_marker: string | null;
}

export interface RelationshipStageHistoryEntry {
  id: string;
  relationship_id: string;
  from_stage: PipelineStage | null;
  to_stage: PipelineStage;
  change_reason: string | null;
  changed_by: string;
  changed_at: string;
}

export type RelationshipTimelineEventType =
  | "relationship_created"
  | "resident_linked"
  | "stage_changed"
  | "touch_logged"
  | "action_created"
  | "action_updated"
  | "action_completed"
  | "action_dismissed"
  | "relationship_won"
  | "relationship_on_hold"
  | "relationship_closed"
  | "working_note_created"
  | "working_note_resolved"
  | "service_opportunity_updated"
  | "relationship_updated"
  | "relationship_converted"
  | "external_client_status_changed"
  | "service_location_updated"
  | "website_inquiry_received"
  // One interaction_logged event per Log Interaction submission already
  // covers initial capture of any Insights/Commitments/Open Loops it
  // produced (see log_relationship_interaction's event_description) — no
  // insight_recorded/commitment_created/open_loop_created event type
  // exists. commitment_resolved/open_loop_resolved fire only when
  // something is later closed.
  | "interaction_logged"
  | "commitment_resolved"
  | "open_loop_resolved";

export interface RelationshipTimelineEvent {
  id: string;
  relationship_id: string;
  event_type: RelationshipTimelineEventType;
  event_title: string;
  event_description: string | null;
  source_type: string;
  source_record_id: string | null;
  system_generated: boolean;
  created_by: string | null;
  created_at: string;
}

export type RelationshipTouchType =
  | "call"
  | "email"
  | "text"
  | "meeting"
  | "assessment"
  | "resident_visit"
  | "proposal"
  | "internal_discussion"
  | "community_interaction"
  | "other";

// Structured result of an interaction — Relationship Intelligence Phase 1.
// Distinct from the free-text `outcome` field, which predates it and is
// kept for backward compatibility.
export type RelationshipInteractionResult =
  | "connected"
  | "left_voicemail"
  | "no_response"
  | "information_sent"
  | "information_received"
  | "meeting_scheduled"
  | "decision_pending"
  | "follow_up_requested"
  | "not_interested"
  | "service_interest_confirmed"
  | "other";

export type RelationshipInteractionParticipantRole =
  | "primary_contact"
  | "resident"
  | "family_member"
  | "serve_team_member"
  | "community_contact"
  | "other";

export interface RelationshipInteractionParticipant {
  role: RelationshipInteractionParticipantRole;
  name: string;
  // Points at an existing identity (e.g. a residents.id) when known — never
  // a duplicate identity record created just for interaction capture.
  personId?: string | null;
}

export interface RelationshipTouch {
  id: string;
  relationship_id: string;
  touch_type: RelationshipTouchType;
  occurred_at: string;
  summary: string;
  interaction_result: RelationshipInteractionResult | null;
  outcome: string | null;
  contact_name: string | null;
  participants: RelationshipInteractionParticipant[];
  // Client-generated, one per Log Interaction form session — lets a
  // retried/double-clicked submission return the original row instead of
  // duplicating it. Null for legacy rows and for anything not submitted
  // through the Log Interaction workflow.
  idempotency_key: string | null;
  created_by: string;
  created_at: string;
  source_type: string;
  source_record_id: string | null;
}

export type RelationshipActionType =
  | "call"
  | "email"
  | "text"
  | "schedule_assessment"
  | "complete_assessment"
  | "prepare_proposal"
  | "send_proposal"
  | "follow_up"
  | "resident_visit"
  | "family_meeting"
  | "other";

export type RelationshipActionStatus = "open" | "completed" | "dismissed";

export interface RelationshipAction {
  id: string;
  relationship_id: string;
  action_type: RelationshipActionType;
  title: string;
  description: string | null;
  due_at: string | null;
  assigned_to: string | null;
  priority: RelationshipPriority;
  status: RelationshipActionStatus;
  completion_outcome: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  completed_by: string | null;
  completed_at: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  // Relationship Intelligence Phase 1 — traces a Next Action back to the
  // Interaction that spawned it, when created through the Log Interaction
  // workflow. Null for manually-created actions. source_commitment_id/
  // source_open_loop_id were deferred (nothing in this phase creates an
  // Action directly from a Commitment or Open Loop) — see ADR 0003.
  source_interaction_id: string | null;
}

export type RelationshipActionEditField =
  | "title"
  | "description"
  | "action_type"
  | "due_at"
  | "assigned_to"
  | "priority";

export interface RelationshipActionEdit {
  id: string;
  relationship_action_id: string;
  field_name: RelationshipActionEditField;
  old_value: string | null;
  new_value: string | null;
  edited_by: string;
  edited_at: string;
}

export type RelationshipWorkingNoteCategory =
  | "operational"
  | "family"
  | "scheduling"
  | "sales"
  | "clinical"
  | "general";

export type RelationshipWorkingNoteStatus = "open" | "resolved" | "archived";

export interface RelationshipWorkingNote {
  id: string;
  relationship_id: string;
  content: string;
  category: RelationshipWorkingNoteCategory | null;
  status: RelationshipWorkingNoteStatus;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  archived_at: string | null;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
  // Relationship Intelligence Phase 1 — see
  // docs/architecture/relationship-intelligence-phase-1-implementation.md.
  // The status vocabulary itself (open/resolved/archived) is unchanged;
  // these are additive fields the original scope asked for.
  relevant_until: string | null;
  resident_id: string | null;
  contact_name: string | null;
  source_description: string | null;
}

// ─── Relationship Intelligence Phase 1 ────────────────────────────────────
// See docs/architecture/relationship-intelligence-phase-1-implementation.md
// and docs/architecture/decisions/0003-interaction-extends-touch.md.

export type RelationshipInsightCategory =
  | "resident_preference"
  | "family_context"
  | "decision_dynamics"
  | "communication_preference"
  | "timing"
  | "service_need"
  | "concern_or_barrier"
  | "financial_consideration"
  | "community_context"
  | "operational"
  | "other";

export type RelationshipInsightStatus = "active" | "resolved" | "outdated";

export interface RelationshipInsight {
  id: string;
  relationship_id: string;
  resident_id: string | null;
  contact_name: string | null;
  content: string;
  category: RelationshipInsightCategory;
  why_it_matters: string | null;
  status: RelationshipInsightStatus;
  relevant_until: string | null;
  source_interaction_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export type RelationshipCommitmentResponsiblePartyType =
  | "serve"
  | "family"
  | "resident"
  | "community"
  | "referral_source"
  | "other";

// "superseded" is deferred — no real supersede workflow exists yet in this
// phase. See ADR 0003.
export type RelationshipCommitmentStatus = "open" | "completed" | "cancelled";

export interface RelationshipCommitment {
  id: string;
  relationship_id: string;
  description: string;
  responsible_party_type: RelationshipCommitmentResponsiblePartyType;
  responsible_party_reference: string | null;
  expected_date: string | null;
  status: RelationshipCommitmentStatus;
  // Consistent closure fields regardless of which terminal status was
  // reached — status itself distinguishes completed vs. cancelled.
  closed_at: string | null;
  closed_by: string | null;
  closure_note: string | null;
  source_interaction_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

// "superseded" is deferred, same rationale as Commitment above.
export type RelationshipOpenLoopStatus = "open" | "resolved" | "no_longer_relevant";

export interface RelationshipOpenLoop {
  id: string;
  relationship_id: string;
  question: string;
  owner: string | null;
  target_resolution_date: string | null;
  status: RelationshipOpenLoopStatus;
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  source_interaction_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

// Early, nonclinical service-planning information for a prospect-oriented
// Relationship — the digital equivalent of what Brian jots on his physical
// whiteboard before a proposal exists. Deliberately not a care plan (no
// clinical fields), not an AxisCare schedule, and not a Cinch visit — see
// docs/design/RELATIONSHIPS.md, "Service Opportunity". One row per
// Relationship (unique relationship_id), edited in place; no field-level
// audit table (unlike relationship_actions) because this is preliminary,
// frequently-revised planning context, not accountable history — one
// Relationship Timeline event per save is sufficient.
export interface RelationshipServiceOpportunity {
  id: string;
  relationship_id: string;
  service_summary: string | null;
  visits_per_week: number | null;
  preferred_days: string | null;
  preferred_time_windows: string | null;
  estimated_visit_minutes: number | null;
  anticipated_start_date: string | null;
  service_location_summary: string | null;
  status: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

// A Relationship-linked, structured expected service address — see
// docs/design/RELATIONSHIPS.md, "External Prospect domain model." Not
// tied to a Resident, not a billing or mailing address, and not a
// confirmed scheduling location until an External Prospect converts (see
// ExternalClient above, the operational address once active).
export type RelationshipServiceLocationType = "expected_service_location" | "confirmed_at_conversion";

export type ResidenceType =
  | "private_home"
  | "apartment"
  | "independent_living"
  | "assisted_living"
  | "skilled_nursing"
  | "family_member_home"
  | "other";

export interface RelationshipServiceLocation {
  id: string;
  relationship_id: string;
  location_type: RelationshipServiceLocationType;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  residence_type: ResidenceType | null;
  facility_name: string | null;
  location_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  distance_from_office_miles: number | null;
  is_current: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

// External Clients — see docs/design/RELATIONSHIPS.md, "External Clients
// is the durable workspace for prospective, active, paused, and former
// clients outside supported communities." One row per Relationship
// (unique relationship_id) carrying the traditional-home-care-specific
// fields a Relationship itself has no reason to carry. Never a second CRM
// entity — every other field (stage, owner, next action, touches, working
// notes, Timeline) stays on the linked `relationships` row.
export type ExternalClientStatus = "active" | "on_hold" | "former";

export interface ExternalClient {
  id: string;
  relationship_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  phone: string | null;
  email: string | null;
  service_address_line_1: string;
  service_address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  primary_contact_name: string | null;
  primary_contact_relationship: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  service_start_date: string | null;
  service_end_date: string | null;
  former_reason: string | null;
  status: ExternalClientStatus;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

// Conversion audit — see docs/design/RELATIONSHIPS.md, "Conversion
// architecture." Append-only; one row per completed conversion.
export type RelationshipConversionPath =
  | "resident_prospect_to_active_client"
  | "external_prospect_to_external_client"
  | "external_prospect_to_new_resident"
  | "external_prospect_to_existing_resident";

export interface RelationshipConversion {
  id: string;
  relationship_id: string;
  from_relationship_type: RelationshipType;
  to_relationship_type: RelationshipType;
  conversion_path: RelationshipConversionPath;
  resident_id: string | null;
  external_client_id: string | null;
  effective_date: string | null;
  conversion_note: string | null;
  converted_by: string;
  converted_at: string;
}
