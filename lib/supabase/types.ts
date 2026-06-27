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
