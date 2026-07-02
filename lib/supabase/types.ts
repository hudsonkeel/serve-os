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
