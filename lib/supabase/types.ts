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
